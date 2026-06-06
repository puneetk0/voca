'use client'

import { motion } from 'framer-motion'
import { Mic, Send } from 'lucide-react'

type VoiceState = 'idle' | 'thinking' | 'speaking' | 'listening' | 'transcribing' | 'error'

interface OmniInputBarProps {
  inputMode: 'voice' | 'text'
  voiceState: VoiceState
  vadVolume: number           // 0–1 — only show waveform bars when > 0
  inputText: string
  onTextChange: (v: string) => void
  onTextSubmit: (e: React.FormEvent) => void
  onMicToggle: () => void     // switch back to voice
  onSwitchToText: () => void  // tap input → 500ms transition to text
  isDisabled: boolean
  currentFieldType?: string
  placeholder?: string
}

/** Number of waveform bars in the mic indicator */
const BAR_COUNT = 5

export function OmniInputBar({
  inputMode,
  voiceState,
  vadVolume,
  inputText,
  onTextChange,
  onTextSubmit,
  onMicToggle,
  onSwitchToText,
  isDisabled,
  currentFieldType,
  placeholder,
}: OmniInputBarProps) {

  // Bars only visible when speech is detected above ambient threshold
  const showWaveform = inputMode === 'voice' && vadVolume > 0.08

  const micColour =
    voiceState === 'speaking'     ? 'text-accent-amber' :
    voiceState === 'listening'    ? 'text-accent-sage' :
    voiceState === 'error'        ? 'text-red-400' :
    voiceState === 'thinking' || voiceState === 'transcribing' ? 'text-foreground/40' :
    'text-foreground/30'

  return (
    <div className="w-full px-4 pb-6 pt-2">
      <motion.div
        layout
        className="relative flex items-center gap-3 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.03] px-4 py-3.5 backdrop-blur-sm"
      >
        {/* ─── Voice waveform / status indicator ─── */}
        {inputMode === 'voice' && (
          <button
            type="button"
            aria-label={voiceState === 'listening' ? 'Listening — tap to stop' : voiceState === 'error' ? 'Error — tap to retry' : 'Microphone'}
            onClick={onMicToggle}
            className={`shrink-0 transition-colors duration-300 ${micColour}`}
            disabled={voiceState === 'thinking' || voiceState === 'transcribing'}
          >
            {showWaveform ? (
              /* Speech-detected: animated bars */
              <span className="flex items-end gap-[3px] h-5 w-5">
                {Array.from({ length: BAR_COUNT }).map((_, i) => {
                  // Stagger heights using vadVolume + sinusoidal offset
                  const height = Math.max(3, Math.round(vadVolume * 20 * Math.abs(Math.sin(i * 1.3))))
                  return (
                    <motion.span
                      key={i}
                      className="w-[2px] rounded-full bg-accent-sage"
                      animate={{ height: `${height}px` }}
                      transition={{ duration: 0.08, ease: 'linear' }}
                      style={{ minHeight: 3 }}
                    />
                  )
                })}
              </span>
            ) : (
              /* Inert mic icon — no surveillance anxiety */
              <Mic className="h-5 w-5" />
            )}
          </button>
        )}

        {/* ─── Text input ─── */}
        <form onSubmit={onTextSubmit} className="flex-1 flex items-center gap-2">
          <input
            type="text"
            aria-label={placeholder ?? 'Your response'}
            value={inputText}
            onChange={e => onTextChange(e.target.value)}
            disabled={isDisabled}
            placeholder={
              placeholder ??
              (inputMode === 'voice' && voiceState === 'listening' ? 'Listening...' :
               inputMode === 'voice' && voiceState === 'speaking'  ? 'AI is speaking...' :
               inputMode === 'voice' ? 'Tap to type instead...' :
               currentFieldType === 'mcq' ? 'Or type your choice...' :
               'Type your response...')
            }
            // 500ms deliberate transition: kill voice, animate, then focus keyboard
            onFocus={inputMode === 'voice' ? onSwitchToText : undefined}
            className="flex-1 bg-transparent text-foreground placeholder:text-foreground/25 text-sm focus:outline-none disabled:opacity-40 font-sans min-w-0"
          />
          {inputMode === 'text' && (
            <button
              type="submit"
              aria-label="Send message"
              disabled={!inputText.trim() || isDisabled}
              className="shrink-0 p-1.5 rounded-full bg-foreground text-background disabled:opacity-20 hover:scale-105 active:scale-95 transition-transform"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </form>

        {/* ─── Keyboard → voice toggle (text mode only) ─── */}
        {inputMode === 'text' && (
          <button
            type="button"
            aria-label="Switch to voice input"
            onClick={onMicToggle}
            className="shrink-0 text-foreground/30 hover:text-foreground/60 transition-colors"
          >
            <Mic className="h-5 w-5" />
          </button>
        )}

        {/* ─── Thinking pulse line at bottom of bar ─── */}
        {(voiceState === 'thinking' || voiceState === 'transcribing') && (
          <motion.div
            className="absolute bottom-0 left-4 right-4 h-[1px] bg-accent-amber/50 rounded-full"
            animate={{ scaleX: [0.2, 1, 0.2], opacity: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
          />
        )}
      </motion.div>
    </div>
  )
}

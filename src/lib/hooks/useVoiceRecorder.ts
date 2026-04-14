import { useState, useRef, useCallback, useEffect } from 'react'

export function useVoiceRecorder(onTranscription: (text: string) => void, formId: string) {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const audioChunks = useRef<BlobPart[]>([])
  
  const onTranscriptionRef = useRef(onTranscription)
  useEffect(() => {
    onTranscriptionRef.current = onTranscription
  }, [onTranscription])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      // Determine format (iOS Safari fallback natively supported!)
      let mimeType = 'audio/webm;codecs=opus'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4' // Best fallback for iOS WebKit
      }

      mediaRecorder.current = new MediaRecorder(stream, { mimeType })
      audioChunks.current = []

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data)
      }

      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: mimeType })
        setIsRecording(false)
        setStream(null)
        setIsProcessing(true)

        try {
          const formData = new FormData()
          formData.append('audio', audioBlob)
          formData.append('formId', formId)

          const res = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData
          })
          
          const data = await res.json()
          if (!res.ok) throw new Error(data.error)
          
          if (data.transcript && data.transcript.trim()) {
             onTranscriptionRef.current(data.transcript)
          }
        } catch (e: any) {
          setError(e.message)
          console.error('Transcription failed:', e)
        } finally {
          setIsProcessing(false)
          stream.getTracks().forEach(track => track.stop())
        }
      }

      mediaRecorder.current.start()
      setIsRecording(true)
      setStream(stream)
      setError(null)
    } catch (e: any) {
      setError('Microphone access denied or unavailable.')
      console.error('Mic error:', e)
    }
  }, [formId])

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop()
    }
  }, [])

  return { startRecording, stopRecording, isRecording, isProcessing, error, stream }
}

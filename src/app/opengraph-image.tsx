import { ImageResponse } from 'next/og'

export const alt = "Voca — It's not a form. It's a conversation."
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '80px',
          background: 'linear-gradient(135deg, #f7f4ef 0%, #f0e7db 100%)',
          fontFamily: 'serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', width: 44, height: 44, borderRadius: 999, background: 'linear-gradient(135deg, #f0b429, #d97706)' }} />
          <div style={{ fontSize: 40, fontWeight: 700, color: '#111111' }}>Voca</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 84, fontWeight: 600, color: '#111111', lineHeight: 1.05 }}>
            It&apos;s not a form.
          </div>
          <div style={{ fontSize: 84, fontWeight: 600, color: '#c96a00', lineHeight: 1.05 }}>
            It&apos;s a conversation.
          </div>
          <div style={{ display: 'flex', marginTop: 28, fontSize: 32, color: '#55503f', fontFamily: 'sans-serif' }}>
            A warm AI voice interviews your respondents. Higher completion, richer answers.
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 26, color: '#8a836f', fontFamily: 'sans-serif' }}>
          voca — the voice-first form builder
        </div>
      </div>
    ),
    { ...size },
  )
}

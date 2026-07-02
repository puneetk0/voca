import { ImageResponse } from 'next/og'
import { createClient } from '@/lib/supabase/server'

export const alt = 'Voice form on Voca'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  let title = 'A voice form'
  let description = ''
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('forms')
      .select('title, description')
      .or(`slug.eq.${slug},id.eq.${slug}`)
      .single()
    if (data?.title) title = data.title
    if (data?.description) description = data.description
  } catch { /* fall back to defaults */ }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'sans-serif' }}>
          <div style={{ display: 'flex', width: 36, height: 36, borderRadius: 999, background: 'linear-gradient(135deg, #f0b429, #d97706)' }} />
          <div style={{ fontSize: 30, fontWeight: 700, color: '#111111' }}>Voca</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 76, fontWeight: 600, color: '#111111', lineHeight: 1.05 }}>
            {title.length > 70 ? title.slice(0, 67) + '…' : title}
          </div>
          {description ? (
            <div style={{ display: 'flex', marginTop: 24, fontSize: 30, color: '#55503f', fontFamily: 'sans-serif' }}>
              {description.length > 110 ? description.slice(0, 107) + '…' : description}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', fontSize: 26, color: '#8a836f', fontFamily: 'sans-serif' }}>
          Answer by voice or text · powered by Voca
        </div>
      </div>
    ),
    { ...size },
  )
}

// Lightweight user-agent parser — no external dependency.
// Derives a coarse device_type / browser / os for response analytics.

export type DeviceInfo = { device_type: string; browser: string; os: string; user_agent: string }

export function parseDevice(ua: string): DeviceInfo {
  const s = ua || ''
  const l = s.toLowerCase()

  // Device type
  let device_type = 'desktop'
  if (/ipad|tablet|playbook|silk/.test(l) || (/android/.test(l) && !/mobile/.test(l))) {
    device_type = 'tablet'
  } else if (/mobi|iphone|ipod|windows phone|android.*mobile/.test(l)) {
    device_type = 'mobile'
  }

  // OS
  let os = 'Unknown'
  if (/iphone|ipad|ipod/.test(l)) os = 'iOS'
  else if (/android/.test(l)) os = 'Android'
  else if (/windows/.test(l)) os = 'Windows'
  else if (/mac os x|macintosh/.test(l)) os = 'macOS'
  else if (/linux/.test(l)) os = 'Linux'

  // Browser (order matters — Edge/Opera masquerade as Chrome)
  let browser = 'Unknown'
  if (/edg\//.test(l)) browser = 'Edge'
  else if (/opr\/|opera/.test(l)) browser = 'Opera'
  else if (/chrome|crios/.test(l)) browser = 'Chrome'
  else if (/firefox|fxios/.test(l)) browser = 'Firefox'
  else if (/safari/.test(l)) browser = 'Safari'

  return { device_type, browser, os, user_agent: s.slice(0, 400) }
}

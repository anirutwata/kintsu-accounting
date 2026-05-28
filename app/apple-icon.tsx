import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 40,
          background: 'linear-gradient(135deg, #D33F22 0%, #9D1F14 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="110" height="110" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.5" />
          <path d="M14.5 9.5C14.5 8.12 13.38 7 12 7s-2.5 1.12-2.5 2.5c0 1.38 1.12 2.5 2.5 2.5s2.5 1.12 2.5 2.5S13.38 17 12 17s-2.5-1.12-2.5-2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="12" y1="5" x2="12" y2="7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="12" y1="17" x2="12" y2="19" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { ...size }
  )
}

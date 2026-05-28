import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

export const runtime = 'nodejs'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  const logoData = readFileSync(join(process.cwd(), 'public', '01_Primary Logo_KINTSU_2.png'))
  const logoBase64 = `data:image/png;base64,${logoData.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: '#EDEBDD',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoBase64}
          alt="KINTSU"
          style={{ width: 140, height: 'auto', objectFit: 'contain' }}
        />
        <div
          style={{
            background: '#D33F22',
            borderRadius: 20,
            paddingLeft: 14,
            paddingRight: 14,
            paddingTop: 4,
            paddingBottom: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ color: 'white', fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
            ACCOUNTING
          </span>
        </div>
      </div>
    ),
    { ...size }
  )
}

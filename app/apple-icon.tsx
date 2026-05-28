import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

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
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoBase64} alt="KINTSU" style={{ width: 148, height: 'auto', objectFit: 'contain' }} />
      </div>
    ),
    { ...size }
  )
}

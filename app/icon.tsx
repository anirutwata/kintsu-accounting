import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

export const runtime = 'nodejs'
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  const logoData = readFileSync(join(process.cwd(), 'public', '01_Primary Logo_KINTSU_2.png'))
  const logoBase64 = `data:image/png;base64,${logoData.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: '#EDEBDD',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 3,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoBase64} alt="KINTSU" style={{ width: 26, height: 'auto', objectFit: 'contain' }} />
      </div>
    ),
    { ...size }
  )
}

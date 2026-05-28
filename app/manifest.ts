import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KINTSU Accounting',
    short_name: 'KINTSUAcct',
    description: 'ระบบบัญชีรายรับ-รายจ่าย Kintsu Yakiniku',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#D33F22',
    theme_color: '#D33F22',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  }
}

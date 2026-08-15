import nodemailer from 'nodemailer'

const EMAIL_FROM = process.env.KINTSU_EMAIL_ADDRESS || 'kintsuyakiniku.kkc@gmail.com'

function getTransport() {
  const pass = process.env.KINTSU_EMAIL_APP_PASSWORD
  if (!pass) throw new Error('KINTSU_EMAIL_APP_PASSWORD ยังไม่ได้ตั้งค่า')
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_FROM, pass },
  })
}

const BRANCH_NAME = process.env.KINTSU_BRANCH_NAME || 'Kintsu Yakiniku Central Khonkaen Campus'
const BRANCH_PHONE = process.env.KINTSU_BRANCH_PHONE || '093-638-6471'

function thaiDate(isoDate: string) {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
  })
}

export async function sendTaxInvoiceEmail(params: {
  to: string
  documentSerial: string
  documentDate: string // YYYY-MM-DD
  pdfBase64: string
}) {
  const transport = getTransport()
  await transport.sendMail({
    from: `"Kintsu Yakiniku Khon Kaen" <${EMAIL_FROM}>`,
    to: params.to,
    subject: `ใบกำกับภาษีร้าน ${BRANCH_NAME}`,
    text: `เรียน ลูกค้า

ทางร้าน ${BRANCH_NAME}
ขอนำส่งเอกสารใบกำกับภาษี วันที่ ${thaiDate(params.documentDate)}
ตามเอกสารแนบ

ด้วยความเคารพ
${BRANCH_NAME.toUpperCase()}
${BRANCH_PHONE}`,
    attachments: [
      {
        filename: `${params.documentSerial}.pdf`,
        content: Buffer.from(params.pdfBase64, 'base64'),
        contentType: 'application/pdf',
      },
    ],
  })
}

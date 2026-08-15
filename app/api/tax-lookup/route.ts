import { NextResponse } from 'next/server'

// Thai Revenue Department (กรมสรรพากร) public VAT-registrant lookup — free, no API key.
// Only returns a match for VAT-registered entities (companies/juristic persons),
// which covers the vast majority of customers requesting a tax invoice.
const RD_URL = 'https://rdws.rd.go.th/jsonRD/vatserviceRD3.asmx'
const RD_SOAP_ACTION = 'https://rdws.rd.go.th/JserviceRD3/vatserviceRD3/Service'

function first(arr: unknown): string {
  return Array.isArray(arr) && typeof arr[0] === 'string' ? arr[0].trim() : ''
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const tin = params.get('tin')?.replace(/[^0-9]/g, '') ?? ''
  const branchNumberParam = Math.max(0, parseInt(params.get('branch') ?? '0', 10) || 0)
  if (tin.length !== 13) return NextResponse.json({ error: 'เลขผู้เสียภาษีต้องมี 13 หลัก' }, { status: 400 })

  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Service xmlns="https://rdws.rd.go.th/JserviceRD3/vatserviceRD3">
      <username>anonymous</username>
      <password>anonymous</password>
      <TIN>${tin}</TIN>
      <ProvinceCode>0</ProvinceCode>
      <BranchNumber>${branchNumberParam}</BranchNumber>
      <AmphurCode>0</AmphurCode>
    </Service>
  </soap:Body>
</soap:Envelope>`

  try {
    const res = await fetch(RD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${RD_SOAP_ACTION}"` },
      body: soapBody,
      signal: AbortSignal.timeout(15000),
    })
    const xml = await res.text()
    const match = xml.match(/<ServiceResult[^>]*>([\s\S]*?)<\/ServiceResult>/)
    if (!match) return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404 })

    const decoded = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    const result = JSON.parse(decoded)

    if (!first(result.Name)) {
      const error = branchNumberParam > 0
        ? `ไม่พบข้อมูลสาขาที่ ${branchNumberParam} กรุณากรอกที่อยู่เอง`
        : 'ไม่พบข้อมูลนิติบุคคลนี้ในระบบกรมสรรพากร'
      return NextResponse.json({ error }, { status: 404 })
    }

    const titleName = first(result.TitleName)
    const name = first(result.Name)
    const houseNumber = first(result.HouseNumber)
    const mooNumber = first(result.MooNumber)
    const soiName = first(result.SoiName)
    const streetName = first(result.StreetName)
    const thambol = first(result.Thambol)
    const amphur = first(result.Amphur)
    const province = first(result.Province)
    const postCode = first(result.PostCode)

    const addressParts = [
      houseNumber,
      mooNumber && mooNumber !== '-' ? `หมู่ ${mooNumber}` : '',
      soiName && soiName !== '-' ? `ซอย${soiName}` : '',
      streetName && streetName !== '-' ? `ถนน${streetName}` : '',
      thambol ? `ตำบล${thambol}` : '',
      amphur ? `อำเภอ${amphur}` : '',
      province ? `จังหวัด${province}` : '',
      postCode,
    ].filter(Boolean)

    const branch = branchNumberParam === 0 ? 'สำนักงานใหญ่' : `สาขาที่ ${branchNumberParam}`

    return NextResponse.json({
      name: [titleName, name].filter(Boolean).join(' '),
      address: addressParts.join(' '),
      branch,
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'เชื่อมต่อกรมสรรพากรไม่สำเร็จ กรุณากรอกเอง' }, { status: 502 })
  }
}

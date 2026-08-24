import { NextResponse } from 'next/server'
import { getChartOfAccounts } from '@/lib/flowaccount'

export async function GET() {
  try {
    const accounts = await getChartOfAccounts()
    return NextResponse.json(accounts.filter(account =>
      account.category === 'Assets' && (/^111/.test(account.code) || /เงินสด|ธนาคาร/i.test(account.nameLocal)),
    ))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'โหลดผังบัญชี FlowAccount ไม่สำเร็จ' }, { status: 500 })
  }
}

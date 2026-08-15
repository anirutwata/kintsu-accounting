import { NextResponse } from 'next/server'
import { getExpenseCategories } from '@/lib/flowaccount'

export async function GET() {
  try {
    const categories = await getExpenseCategories()
    return NextResponse.json(categories)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

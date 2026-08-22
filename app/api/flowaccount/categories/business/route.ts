import { NextResponse } from 'next/server'
import { getBusinessCategories } from '@/lib/flowaccount'

export async function GET() {
  try {
    const categories = await getBusinessCategories()
    return NextResponse.json(categories)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

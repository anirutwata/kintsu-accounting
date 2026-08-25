import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { importTtbPromptPayFromGmail } from '@/lib/ttbPromptPayImport'

export const maxDuration = 60

export async function POST() {
  try {
    const cookieStore = await cookies()
    if (!cookieStore.get('kintsu_acc_user_id')?.value) {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 })
    }
    return NextResponse.json(await importTtbPromptPayFromGmail(await createClient()))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { importTtbPromptPayFromGmail } from '@/lib/ttbPromptPayImport'

export const maxDuration = 60

async function run(req: Request) {
  const authorization = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await importTtbPromptPayFromGmail(await createClient()))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export const GET = run
export const POST = run

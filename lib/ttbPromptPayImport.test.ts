import { afterEach, describe, expect, it } from 'vitest'
import { requiredEnv } from './ttbPromptPayImport'

describe('requiredEnv', () => {
  const KEY = 'TTB_SMARTSHOP_REPORT_PASSWORD'
  afterEach(() => {
    delete process.env[KEY]
  })

  it('trims whitespace/newlines a Vercel dashboard entry can silently add', () => {
    process.env[KEY] = '6138\n'
    expect(requiredEnv(KEY)).toBe('6138')
    process.env[KEY] = ' 6138 '
    expect(requiredEnv(KEY)).toBe('6138')
  })

  it('throws when the value is missing or only whitespace', () => {
    delete process.env[KEY]
    expect(() => requiredEnv(KEY)).toThrow(`ยังไม่ได้ตั้งค่า ${KEY}`)
    process.env[KEY] = '   '
    expect(() => requiredEnv(KEY)).toThrow(`ยังไม่ได้ตั้งค่า ${KEY}`)
  })
})

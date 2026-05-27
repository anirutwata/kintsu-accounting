'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [pin, setPin] = useState(['', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const router = useRouter()

  async function handleSubmit(fullPin: string) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: fullPin }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'PIN ไม่ถูกต้อง')
        setPin(['', '', '', ''])
        inputs.current[0]?.focus()
        return
      }
      router.push('/dashboard')
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  function handleChange(index: number, value: string) {
    if (!/^\d?$/.test(value)) return
    const next = [...pin]
    next[index] = value
    setPin(next)
    if (value && index < 3) {
      inputs.current[index + 1]?.focus()
    }
    if (next.every(d => d !== '')) {
      handleSubmit(next.join(''))
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputs.current[index - 1]?.focus()
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'var(--background)' }}>
      <div className="w-full max-w-sm px-6">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-block mb-4 p-4 rounded-2xl" style={{ background: 'var(--flame-red)' }}>
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--charcoal)' }}>KINTSU Accounting</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>ระบบบัญชีรายรับ-รายจ่าย</p>
        </div>

        {/* PIN Input */}
        <div className="bg-white rounded-2xl shadow-sm p-8 border" style={{ borderColor: 'var(--border)' }}>
          <p className="text-center text-sm font-medium mb-6" style={{ color: 'var(--muted-foreground)' }}>
            ใส่รหัส PIN 4 หลัก
          </p>
          <div className="flex justify-center gap-3 mb-6">
            {pin.map((digit, i) => (
              <input
                key={i}
                ref={el => { inputs.current[i] = el }}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handleChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                className="pin-digit"
                autoFocus={i === 0}
                disabled={loading}
              />
            ))}
          </div>

          {error && (
            <div className="text-center text-sm mb-4 p-2 rounded-lg bg-red-50 text-red-600">
              {error}
            </div>
          )}

          {loading && (
            <p className="text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
              กำลังเข้าสู่ระบบ...
            </p>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--muted-foreground)' }}>
          Kintsu Yakiniku — Central Khonkaen Campus
        </p>
      </div>
    </div>
  )
}

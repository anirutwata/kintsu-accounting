'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'ไม่พบชื่อนี้ในระบบ')
        return
      }
      router.push('/dashboard')
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
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

        {/* Name Input */}
        <div className="bg-white rounded-2xl shadow-sm p-6 border" style={{ borderColor: 'var(--border)' }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-center" style={{ color: 'var(--muted-foreground)' }}>
                ใส่ชื่อของคุณ
              </label>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setError('') }}
                placeholder="ชื่อ-นามสกุล"
                autoFocus
                className="w-full border rounded-xl px-4 py-3 text-center text-base focus:outline-none"
                style={{ borderColor: error ? '#FCA5A5' : 'var(--border)' }}
                disabled={loading}
              />
            </div>

            {error && (
              <div className="text-center text-sm p-2 rounded-lg bg-red-50 text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="w-full py-3 rounded-xl font-semibold text-white transition-opacity disabled:opacity-40"
              style={{ background: 'var(--flame-red)' }}>
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--muted-foreground)' }}>
          Kintsu Yakiniku — Central Khonkaen Campus
        </p>
      </div>
    </div>
  )
}

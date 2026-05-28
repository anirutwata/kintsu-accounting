'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface UserOption {
  id: string
  name: string
  role: string
}

const roleLabel: Record<string, string> = {
  owner: 'เจ้าของร้าน',
  manager: 'ผู้จัดการ',
  cashier: 'แคชเชียร์',
}

export default function LoginPage() {
  const [users, setUsers] = useState<UserOption[]>([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(setUsers)
  }, [])

  async function handleLogin(name: string) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'เกิดข้อผิดพลาด')
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

        {/* Name Selection */}
        <div className="bg-white rounded-2xl shadow-sm p-6 border" style={{ borderColor: 'var(--border)' }}>
          <p className="text-center text-sm font-medium mb-4" style={{ color: 'var(--muted-foreground)' }}>
            เลือกชื่อของคุณ
          </p>

          <div className="space-y-2">
            {users.length === 0 ? (
              <div className="text-center py-4 text-sm text-gray-400">กำลังโหลด...</div>
            ) : (
              users.map(user => (
                <button
                  key={user.id}
                  onClick={() => { setSelected(user.name); handleLogin(user.name) }}
                  disabled={loading}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all disabled:opacity-50"
                  style={{
                    borderColor: selected === user.name ? 'var(--flame-red)' : 'var(--border)',
                    background: selected === user.name ? '#FEF2F2' : 'white',
                  }}>
                  <span className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>{user.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                    {roleLabel[user.role] || user.role}
                  </span>
                </button>
              ))
            )}
          </div>

          {error && (
            <div className="mt-3 text-center text-sm p-2 rounded-lg bg-red-50 text-red-600">
              {error}
            </div>
          )}

          {loading && (
            <p className="mt-3 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
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

'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const ROLES = [
  { value: 'owner',   label: 'เจ้าของร้าน', icon: '👑' },
  { value: 'manager', label: 'ผู้จัดการ',   icon: '🧑‍💼' },
  { value: 'cashier', label: 'แคชเชียร์',   icon: '🧾' },
]

export default function LoginPage() {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !role) return
    setLoading(true)
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), role }),
    })
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'var(--background)' }}>
      <div className="w-full max-w-sm px-6">
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

        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-2xl shadow-sm p-6 border space-y-5" style={{ borderColor: 'var(--border)' }}>
            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
                ชื่อของคุณ
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="พิมพ์ชื่อ..."
                autoFocus
                className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none"
                style={{ borderColor: 'var(--border)' }}
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
                ตำแหน่ง
              </label>
              <div className="grid grid-cols-3 gap-2">
                {ROLES.map(r => (
                  <button key={r.value} type="button" onClick={() => setRole(r.value)}
                    className="flex flex-col items-center py-3 rounded-xl border text-sm font-medium transition-all"
                    style={{
                      borderColor: role === r.value ? 'var(--flame-red)' : 'var(--border)',
                      background: role === r.value ? '#FEF2F2' : 'white',
                      color: role === r.value ? 'var(--flame-red)' : 'var(--charcoal)',
                    }}>
                    <span className="text-xl mb-1">{r.icon}</span>
                    <span className="text-xs">{r.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={!name.trim() || !role || loading}
              className="w-full py-3 rounded-xl font-semibold text-white transition-opacity disabled:opacity-40"
              style={{ background: 'var(--flame-red)' }}>
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </div>
        </form>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--muted-foreground)' }}>
          Kintsu Yakiniku — Central Khonkaen Campus
        </p>
      </div>
    </div>
  )
}

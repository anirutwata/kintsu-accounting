'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Mode = 'select' | 'admin' | 'staff'

const STAFF_ROLES = [
  { value: 'manager',   label: 'ผู้จัดการร้าน', icon: '🧑‍💼' },
  { value: 'cashier',   label: 'แคชเชียร์',     icon: '🧾' },
  { value: 'purchasing', label: 'จัดซื้อ',       icon: '🛒' },
]

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('select')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Admin fields
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  // Staff fields
  const [name, setName] = useState('')
  const [role, setRole] = useState('')

  const router = useRouter()

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'owner', username, password }),
    })
    setLoading(false)
    if (!res.ok) {
      const d = await res.json()
      setError(d.error || 'เข้าสู่ระบบไม่สำเร็จ')
      return
    }
    router.push('/dashboard')
  }

  async function handleStaffLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !role) return
    setError('')
    setLoading(true)
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), role }),
    })
    setLoading(false)
    const dest = role === 'cashier' ? '/sales' : role === 'purchasing' ? '/expenses' : '/dashboard'
    router.push(dest)
  }

  function reset() {
    setMode('select')
    setError('')
    setUsername('')
    setPassword('')
    setName('')
    setRole('')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'var(--background)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-block mb-4 p-4 rounded-2xl" style={{ background: 'var(--flame-red)' }}>
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--charcoal)' }}>KINTSU Accounting</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>ระบบบัญชีรายรับ-รายจ่าย</p>
        </div>

        {/* Mode select */}
        {mode === 'select' && (
          <div className="space-y-3">
            <button onClick={() => setMode('admin')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border bg-white text-left transition-all hover:border-red-300"
              style={{ borderColor: 'var(--border)' }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{ background: '#FEF2F2' }}>🔐</div>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>Admin / เจ้าของร้าน</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>ต้องใส่รหัสผ่าน — เข้าถึงได้ทุกส่วน</p>
              </div>
            </button>

            <button onClick={() => setMode('staff')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border bg-white text-left transition-all hover:border-stone-300"
              style={{ borderColor: 'var(--border)' }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{ background: '#F5F0EA' }}>👤</div>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>พนักงาน</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>ใส่ชื่อและเลือกตำแหน่ง — ไม่ต้องรหัสผ่าน</p>
              </div>
            </button>
          </div>
        )}

        {/* Admin login */}
        {mode === 'admin' && (
          <form onSubmit={handleAdminLogin}>
            <div className="bg-white rounded-2xl shadow-sm p-6 border space-y-4" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🔐</span>
                <span className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>Admin / เจ้าของร้าน</span>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>ชื่อผู้ใช้</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="username" autoFocus autoComplete="username"
                  className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none"
                  style={{ borderColor: 'var(--border)' }} />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>รหัสผ่าน</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" autoComplete="current-password"
                  className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none"
                  style={{ borderColor: 'var(--border)' }} />
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <button type="submit" disabled={!username.trim() || !password || loading}
                className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-40"
                style={{ background: 'var(--flame-red)' }}>
                {loading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
              </button>

              <button type="button" onClick={reset}
                className="w-full py-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                ย้อนกลับ
              </button>
            </div>
          </form>
        )}

        {/* Staff login */}
        {mode === 'staff' && (
          <form onSubmit={handleStaffLogin}>
            <div className="bg-white rounded-2xl shadow-sm p-6 border space-y-4" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">👤</span>
                <span className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>พนักงาน</span>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>ชื่อของคุณ</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="พิมพ์ชื่อ..." autoFocus
                  className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none"
                  style={{ borderColor: 'var(--border)' }} />
              </div>

              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>ตำแหน่ง</label>
                <div className="grid grid-cols-3 gap-2">
                  {STAFF_ROLES.map(r => (
                    <button key={r.value} type="button" onClick={() => setRole(r.value)}
                      className="flex flex-col items-center py-3 rounded-xl border text-sm font-medium transition-all"
                      style={{
                        borderColor: role === r.value ? 'var(--flame-red)' : 'var(--border)',
                        background: role === r.value ? '#FEF2F2' : 'white',
                        color: role === r.value ? 'var(--flame-red)' : 'var(--charcoal)',
                      }}>
                      <span className="text-xl mb-1">{r.icon}</span>
                      <span className="text-xs text-center leading-tight">{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <button type="submit" disabled={!name.trim() || !role || loading}
                className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-40"
                style={{ background: 'var(--flame-red)' }}>
                {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>

              <button type="button" onClick={reset}
                className="w-full py-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                ย้อนกลับ
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-xs mt-6" style={{ color: 'var(--muted-foreground)' }}>
          Kintsu Yakiniku — Central Khonkaen Campus
        </p>
      </div>
    </div>
  )
}

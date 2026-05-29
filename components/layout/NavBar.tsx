'use client'
import { useRouter } from 'next/navigation'

interface Props { name: string; role: string }

const roleLabel: Record<string, string> = {
  owner: 'เจ้าของร้าน',
  manager: 'ผู้จัดการร้าน',
  cashier: 'แคชเชียร์',
  purchasing: 'จัดซื้อ',
}

export default function NavBar({ name, role }: Props) {
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 border-b" style={{ background: 'white', borderColor: 'var(--border)' }}>
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--flame-red)' }}>
            <span className="text-white text-xs font-bold">K</span>
          </div>
          <span className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>KINTSU Accounting</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium" style={{ color: 'var(--charcoal)' }}>{name}</p>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{roleLabel[role] || role}</p>
          </div>
          <button onClick={logout} className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
            style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
            ออก
          </button>
        </div>
      </div>
    </header>
  )
}

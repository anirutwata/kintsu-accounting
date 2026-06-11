'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

interface Props { role: string }

const navItems = [
  { href: '/dashboard', label: 'หน้าหลัก', icon: '📊', roles: ['owner', 'manager'] },
  { href: '/expenses',  label: 'รายจ่าย',  icon: '🧾', roles: ['owner', 'manager', 'purchasing'] },
  { href: '/sales',     label: 'รายรับ',   icon: '💰', roles: ['owner', 'manager', 'cashier'] },
  { href: '/transfers', label: 'โอนเงิน',  icon: '🔄', roles: ['owner', 'manager'] },
  { href: '/journal',        label: 'สมุดรายวัน',  icon: '📔', roles: ['owner', 'manager'] },
  { href: '/manual-journal', label: 'ปรับปรุงบัญชี', icon: '✏️', roles: ['owner'] },
  { href: '/reconcile', label: 'กระทบยอด', icon: '🏦', roles: ['owner', 'manager'] },
  { href: '/assets',       label: 'สินทรัพย์',   icon: '🏗️', roles: ['owner'] },
  { href: '/depreciation', label: 'ค่าเสื่อมราคา', icon: '📉', roles: ['owner'] },
  { href: '/accounts',       label: 'ผังบัญชี',  icon: '📒', roles: ['owner'] },
  { href: '/trial-balance',    label: 'งบทดลอง',      icon: '⚖️', roles: ['owner'] },
  { href: '/income-statement', label: 'งบกำไรขาดทุน', icon: '📉', roles: ['owner'] },
  { href: '/balance-sheet',    label: 'งบดุล',          icon: '🏛️', roles: ['owner'] },
  { href: '/cash-flow',        label: 'กระแสเงินสด',   icon: '💵', roles: ['owner'] },
  { href: '/reports',          label: 'รายงาน',         icon: '📈', roles: ['owner'] },
  { href: '/settings',  label: 'ตั้งค่า',  icon: '⚙️', roles: ['owner'] },
]

const MAX_VISIBLE = 4

export default function BottomNav({ role }: Props) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const items = navItems.filter(i => i.roles.includes(role))

  const visible = items.slice(0, MAX_VISIBLE)
  const overflow = items.slice(MAX_VISIBLE)
  const overflowActive = overflow.some(i => pathname === i.href || pathname.startsWith(i.href + '/'))

  return (
    <>
      {/* Overflow drawer */}
      {open && (
        <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
          <div className="fixed bottom-16 left-0 right-0 z-50 mx-auto max-w-2xl px-4"
            onClick={e => e.stopPropagation()}>
            <div className="rounded-2xl border shadow-lg overflow-hidden"
              style={{ background: 'white', borderColor: 'var(--border)' }}>
              <div className="grid grid-cols-4 divide-x"
                style={{ borderColor: 'var(--border)' }}>
                {overflow.map(item => {
                  const active = pathname === item.href || pathname.startsWith(item.href + '/')
                  return (
                    <Link key={item.href} href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex flex-col items-center py-3 gap-1 transition-colors"
                      style={{ color: active ? 'var(--flame-red)' : 'var(--muted-foreground)' }}>
                      <span className="text-2xl leading-none">{item.icon}</span>
                      <span className="text-[11px] font-medium">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t print:hidden"
        style={{ background: 'white', borderColor: 'var(--border)' }}>
        <div className="max-w-2xl mx-auto flex">
          {visible.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link key={item.href} href={item.href}
                className="flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors"
                style={{ color: active ? 'var(--flame-red)' : 'var(--muted-foreground)' }}>
                <span className="text-xl leading-none">{item.icon}</span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            )
          })}
          {overflow.length > 0 && (
            <button
              onClick={() => setOpen(v => !v)}
              className="flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors"
              style={{ color: overflowActive || open ? 'var(--flame-red)' : 'var(--muted-foreground)' }}>
              <span className="text-xl leading-none">{open ? '✕' : '☰'}</span>
              <span className="text-[10px] font-medium">เพิ่มเติม</span>
            </button>
          )}
        </div>
      </nav>
    </>
  )
}

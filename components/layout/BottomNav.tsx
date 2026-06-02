'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props { role: string }

const navItems = [
  { href: '/dashboard', label: 'หน้าหลัก', icon: '📊', roles: ['owner', 'manager'] },
  { href: '/expenses',  label: 'รายจ่าย',  icon: '🧾', roles: ['owner', 'manager', 'purchasing'] },
  { href: '/sales',     label: 'รายรับ',   icon: '💰', roles: ['owner', 'manager', 'cashier'] },
  { href: '/assets',    label: 'สินทรัพย์', icon: '🏗️', roles: ['owner'] },
  { href: '/transfers', label: 'โอนเงิน',  icon: '🔄', roles: ['owner', 'manager'] },
  { href: '/reports',   label: 'รายงาน',   icon: '📈', roles: ['owner'] },
  { href: '/settings',  label: 'ตั้งค่า',  icon: '⚙️', roles: ['owner'] },
]

export default function BottomNav({ role }: Props) {
  const pathname = usePathname()
  const items = navItems.filter(i => i.roles.includes(role))

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t"
      style={{ background: 'white', borderColor: 'var(--border)' }}>
      <div className="max-w-2xl mx-auto flex">
        {items.map(item => {
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
      </div>
    </nav>
  )
}

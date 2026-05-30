'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const SETTINGS_ITEMS = [
  { href: '/settings/users', icon: '👥', label: 'ผู้ใช้งาน', desc: 'เพิ่ม แก้ไข และจัดการสิทธิ์ผู้ใช้' },
  { href: '/settings/banks', icon: '🏦', label: 'บัญชีธนาคาร', desc: 'เพิ่ม แก้ไข บัญชีรับเงิน' },
  { href: '/settings/categories?type=expense', icon: '📋', label: 'หมวดหมู่ค่าใช้จ่าย', desc: 'จัดการหมวดหมู่สำหรับบันทึกค่าใช้จ่าย' },
  { href: '/settings/categories?type=asset', icon: '🏗️', label: 'หมวดหมู่สินทรัพย์', desc: 'จัดการหมวดหมู่สินทรัพย์ถาวร' },
  { href: '/settings/targets', icon: '🎯', label: 'เป้าหมายรายเดือน', desc: 'ตั้งเป้ารายได้ Food Cost Labor Cost' },
  { href: '/settings/system', icon: '⚙️', label: 'ตั้งค่าระบบ', desc: 'Grab GP%, VAT, ชื่อร้าน, Telegram' },
]

export default function SettingsPage() {
  return (
    <div className="space-y-4 py-4">
      <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>ตั้งค่า</h1>
      <div className="space-y-2">
        {SETTINGS_ITEMS.map(item => (
          <Link key={item.href} href={item.href}
            className="flex items-center gap-4 bg-white rounded-2xl border p-4 active:bg-gray-50"
            style={{ borderColor: 'var(--border)' }}>
            <span className="text-2xl">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{item.label}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{item.desc}</p>
            </div>
            <span className="text-gray-300 text-lg">›</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

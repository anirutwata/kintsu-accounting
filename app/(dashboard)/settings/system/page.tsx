'use client'
import { useState, useEffect } from 'react'
import type { Settings } from '@/types'

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // form fields
  const [restaurantName, setRestaurantName] = useState('')
  const [grabGpPct, setGrabGpPct] = useState('')
  const [vatPct, setVatPct] = useState('')
  const [scPct, setScPct] = useState('')
  const [tgToken, setTgToken] = useState('')
  const [tgChatId, setTgChatId] = useState('')
  const [showToken, setShowToken] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/settings')
    if (res.ok) {
      const s: Settings = await res.json()
      setSettings(s)
      setRestaurantName(s.restaurant_name || '')
      setGrabGpPct(s.grabfood_gp_bps ? String(s.grabfood_gp_bps / 100) : '30')
      setVatPct(s.vat_rate_bps ? String(s.vat_rate_bps / 100) : '7')
      setScPct(s.service_charge_bps ? String(s.service_charge_bps / 100) : '10')
      setTgToken(s.telegram_bot_token || '')
      setTgChatId(s.telegram_chat_id || '')
    }
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant_name: restaurantName.trim(),
        grabfood_gp_bps: Math.round((parseFloat(grabGpPct) || 30) * 100),
        vat_rate_bps: Math.round((parseFloat(vatPct) || 7) * 100),
        service_charge_bps: Math.round((parseFloat(scPct) || 0) * 100),
        telegram_bot_token: tgToken.trim() || null,
        telegram_chat_id: tgChatId.trim() || null,
      }),
    })
    setSaving(false)
    setSaved(true)
    load()
  }

  if (loading) return <div className="py-10 text-center text-gray-400 text-sm">กำลังโหลด...</div>

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>ตั้งค่าระบบ</h1>

      {saved && (
        <div className="p-3 rounded-xl bg-green-50 text-green-700 text-sm">✅ บันทึกการตั้งค่าแล้ว</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* General */}
        <div className="bg-white rounded-2xl border p-4 space-y-3" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>ข้อมูลร้าน</p>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>ชื่อร้าน</label>
            <input value={restaurantName} onChange={e => setRestaurantName(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}
              placeholder="KINTSU Yakiniku" />
          </div>
        </div>

        {/* Financial */}
        <div className="bg-white rounded-2xl border p-4 space-y-3" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>อัตราค่าธรรมเนียม</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Grab GP %', value: grabGpPct, set: setGrabGpPct, placeholder: '30' },
              { label: 'VAT %', value: vatPct, set: setVatPct, placeholder: '7' },
              { label: 'SC %', value: scPct, set: setScPct, placeholder: '0' },
            ].map(({ label, value, set, placeholder }) => (
              <div key={label}>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>{label}</label>
                <div className="relative">
                  <input type="number" min="0" max="100" step="0.1" value={value}
                    onChange={e => set(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 text-sm text-right pr-7"
                    style={{ borderColor: 'var(--border)' }} placeholder={placeholder} />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Telegram */}
        <div className="bg-white rounded-2xl border p-4 space-y-3" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Telegram แจ้งเตือน</p>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>
              Bot Token
              <button type="button" onClick={() => setShowToken(v => !v)} className="ml-2 underline">
                {showToken ? 'ซ่อน' : 'แสดง'}
              </button>
            </label>
            <input type={showToken ? 'text' : 'password'} value={tgToken} onChange={e => setTgToken(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm font-mono" style={{ borderColor: 'var(--border)' }}
              placeholder="1234567890:AAXXXXXXXX..." />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>Chat ID</label>
            <input value={tgChatId} onChange={e => setTgChatId(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm font-mono" style={{ borderColor: 'var(--border)' }}
              placeholder="-1001234567890" />
          </div>
        </div>

        <button type="submit" disabled={saving}
          className="w-full py-3 rounded-2xl font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--flame-red)' }}>
          {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
        </button>
      </form>
    </div>
  )
}

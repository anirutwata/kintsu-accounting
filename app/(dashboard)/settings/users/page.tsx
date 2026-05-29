'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface AdminUser {
  id: string
  username: string
  display_name: string
  is_active: boolean
  created_at: string
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', display_name: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [changePwdId, setChangePwdId] = useState<string | null>(null)
  const [newPwd, setNewPwd] = useState('')

  useEffect(() => {
    const role = document.cookie.match(/kintsu_acc_role=([^;]+)/)?.[1]
    if (role !== 'owner') { router.replace('/dashboard'); return }
    load()
  }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/users')
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json()
      setError(d.error || 'เพิ่มไม่สำเร็จ')
      return
    }
    setForm({ username: '', password: '', display_name: '' })
    setShowAdd(false)
    load()
  }

  async function toggleActive(u: AdminUser) {
    await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !u.is_active }),
    })
    load()
  }

  async function handleChangePwd(id: string) {
    if (!newPwd) return
    await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPwd }),
    })
    setChangePwdId(null)
    setNewPwd('')
  }

  async function handleDelete(id: string) {
    if (!confirm('ลบบัญชีนี้?')) return
    await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>จัดการบัญชี Admin</h1>
        <button onClick={() => { setShowAdd(true); setError('') }}
          className="text-sm px-3 py-1.5 rounded-lg text-white font-medium"
          style={{ background: 'var(--flame-red)' }}>
          + เพิ่ม
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white rounded-2xl p-4 border space-y-3" style={{ borderColor: 'var(--border)' }}>
          <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>เพิ่มบัญชี Admin ใหม่</p>
          <input type="text" placeholder="ชื่อที่แสดง (เช่น เจ้าของร้าน)" value={form.display_name}
            onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
          <input type="text" placeholder="Username" value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
          <input type="password" placeholder="รหัสผ่าน" value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--flame-red)' }}>
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)}
              className="flex-1 py-2 rounded-xl text-sm border" style={{ borderColor: 'var(--border)' }}>
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      {/* Users list */}
      {loading ? (
        <p className="text-sm text-center py-8" style={{ color: 'var(--muted-foreground)' }}>กำลังโหลด...</p>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="bg-white rounded-2xl p-4 border" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{u.display_name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>@{u.username}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {u.is_active ? 'ใช้งานได้' : 'ปิดใช้งาน'}
                  </span>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <button onClick={() => toggleActive(u)}
                    className="text-xs px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                    {u.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                  </button>
                  <button onClick={() => { setChangePwdId(changePwdId === u.id ? null : u.id); setNewPwd('') }}
                    className="text-xs px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                    เปลี่ยนรหัสผ่าน
                  </button>
                  <button onClick={() => handleDelete(u.id)}
                    className="text-xs px-2 py-1 rounded-lg text-red-600 border border-red-200">
                    ลบ
                  </button>
                </div>
              </div>
              {changePwdId === u.id && (
                <div className="flex gap-2 mt-3">
                  <input type="password" placeholder="รหัสผ่านใหม่" value={newPwd}
                    onChange={e => setNewPwd(e.target.value)}
                    className="flex-1 border rounded-xl px-3 py-1.5 text-sm" style={{ borderColor: 'var(--border)' }} />
                  <button onClick={() => handleChangePwd(u.id)}
                    className="px-3 py-1.5 rounded-xl text-sm font-medium text-white"
                    style={{ background: 'var(--flame-red)' }}>
                    บันทึก
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

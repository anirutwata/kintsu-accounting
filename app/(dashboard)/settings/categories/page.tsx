'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

interface Category {
  id: string
  name: string
  category_type: 'expense' | 'asset'
  sort_order: number
  is_active: boolean
}

function CategoriesContent() {
  const searchParams = useSearchParams()
  const typeParam = (searchParams.get('type') ?? 'expense') as 'expense' | 'asset'
  const [type, setType] = useState<'expense' | 'asset'>(typeParam)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  useEffect(() => { load() }, [type])

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/categories?all=true&type=${type}`)
    setCategories(await res.json())
    setLoading(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), category_type: type }),
    })
    setNewName('')
    setAdding(false)
    load()
  }

  async function handleEdit(id: string) {
    if (!editName.trim()) return
    await fetch(`/api/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim() }),
    })
    setEditId(null)
    load()
  }

  async function toggleActive(cat: Category) {
    await fetch(`/api/categories/${cat.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !cat.is_active }),
    })
    load()
  }

  async function handleDelete(id: string) {
    await fetch(`/api/categories/${id}`, { method: 'DELETE' })
    setDeleteConfirm(null)
    load()
  }

  const active = categories.filter(c => c.is_active)
  const inactive = categories.filter(c => !c.is_active)

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>
          {type === 'expense' ? 'หมวดหมู่ค่าใช้จ่าย' : 'หมวดหมู่สินทรัพย์'}
        </h1>
      </div>

      {/* Tab toggle */}
      <div className="flex rounded-lg overflow-hidden border text-sm" style={{ borderColor: 'var(--border)' }}>
        <button onClick={() => setType('expense')}
          className="flex-1 py-2 font-medium transition-colors"
          style={{ background: type === 'expense' ? 'var(--flame-red)' : 'white', color: type === 'expense' ? 'white' : 'var(--charcoal)' }}>
          💸 ค่าใช้จ่าย
        </button>
        <button onClick={() => setType('asset')}
          className="flex-1 py-2 font-medium transition-colors"
          style={{ background: type === 'asset' ? 'var(--flame-red)' : 'white', color: type === 'asset' ? 'white' : 'var(--charcoal)' }}>
          🏗️ สินทรัพย์
        </button>
      </div>

      {/* Add form */}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input value={newName} onChange={e => setNewName(e.target.value)}
          className="flex-1 border rounded-xl px-3 py-2 text-sm"
          style={{ borderColor: 'var(--border)' }}
          placeholder={type === 'expense' ? 'ชื่อหมวดหมู่ค่าใช้จ่าย...' : 'ชื่อหมวดหมู่สินทรัพย์...'} />
        <button type="submit" disabled={adding || !newName.trim()}
          className="px-3 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 shrink-0"
          style={{ background: 'var(--flame-red)' }}>
          {adding ? '...' : '+ เพิ่ม'}
        </button>
      </form>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />)}</div>
      ) : (
        <div className="space-y-1">
          {[...active, ...inactive].map(cat => (
            <div key={cat.id} className="bg-white rounded-xl border overflow-hidden"
              style={{ borderColor: 'var(--border)', opacity: cat.is_active ? 1 : 0.5 }}>
              {editId === cat.id ? (
                <div className="flex items-center gap-2 px-3 py-2">
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    className="flex-1 border rounded-lg px-2 py-1 text-sm"
                    style={{ borderColor: 'var(--border)' }}
                    autoFocus onKeyDown={e => { if (e.key === 'Enter') handleEdit(cat.id); if (e.key === 'Escape') setEditId(null) }} />
                  <button onClick={() => handleEdit(cat.id)} className="text-xs px-2 py-1 rounded-lg text-white" style={{ background: 'var(--flame-red)' }}>บันทึก</button>
                  <button onClick={() => setEditId(null)} className="text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--muted-foreground)' }}>ยกเลิก</button>
                </div>
              ) : (
                <div className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: 'var(--charcoal)' }}>{cat.name}</span>
                    {!cat.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">ปิด</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditId(cat.id); setEditName(cat.name) }}
                      className="text-xs px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--charcoal)' }}>แก้ไข</button>
                    <button onClick={() => toggleActive(cat)} className="text-xs px-2 py-1 rounded-lg"
                      style={{ color: cat.is_active ? '#6B7280' : '#16A34A' }}>
                      {cat.is_active ? 'ปิด' : 'เปิด'}
                    </button>
                    {deleteConfirm === cat.id ? (
                      <>
                        <button onClick={() => handleDelete(cat.id)} className="text-xs px-2 py-1 rounded-lg text-red-600 font-semibold">ลบ?</button>
                        <button onClick={() => setDeleteConfirm(null)} className="text-xs px-1 py-1 rounded-lg" style={{ color: 'var(--muted-foreground)' }}>✕</button>
                      </>
                    ) : (
                      <button onClick={() => setDeleteConfirm(cat.id)} className="text-xs px-2 py-1 rounded-lg text-red-400">ลบ</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {categories.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-6">ยังไม่มีหมวดหมู่</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function CategoriesPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-gray-400 text-sm">กำลังโหลด...</div>}>
      <CategoriesContent />
    </Suspense>
  )
}

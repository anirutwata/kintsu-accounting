'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { DailySales } from '@/types'

interface Props { sales: DailySales[] }

export default function RevenueChart({ sales }: Props) {
  const data = [...sales]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => ({
      date: s.date.slice(8), // day number
      'หน้าร้าน': Math.round(s.dine_in_revenue_satang / 100),
      'Grab': Math.round(s.grabfood_net_satang / 100),
      'กลับบ้าน': Math.round(s.takeaway_revenue_satang / 100),
    }))

  return (
    <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: 'var(--border)' }}>
      <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--charcoal)' }}>รายได้รายวัน</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `฿${(v/1000).toFixed(0)}K`} />
          <Tooltip formatter={(v) => [`฿${Number(v).toLocaleString()}`, '']} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar dataKey="หน้าร้าน" fill="#D33F22" radius={[3,3,0,0]} />
          <Bar dataKey="Grab" fill="#9F8966" radius={[3,3,0,0]} />
          <Bar dataKey="กลับบ้าน" fill="#9D1F14" radius={[3,3,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

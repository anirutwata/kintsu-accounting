interface Props {
  label: string
  value: string
  sub?: string
  icon: string
  color?: 'red' | 'green' | 'yellow' | 'stone'
}

const bgMap = { red: '#FEF2F2', green: '#F0FDF4', yellow: '#FFFBEB', stone: '#F9F6F0' }
const textMap = { red: '#991B1B', green: '#065F46', yellow: '#92400E', stone: 'var(--warm-stone)' }

export default function KPICard({ label, value, sub, icon, color = 'stone' }: Props) {
  return (
    <div className="rounded-2xl p-4 border" style={{ background: bgMap[color], borderColor: 'transparent' }}>
      <div className="flex items-start justify-between mb-1">
        <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
        <span className="text-base leading-none">{icon}</span>
      </div>
      <p className="text-lg font-bold leading-tight" style={{ color: textMap[color] }}>{value}</p>
      {sub && <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{sub}</p>}
    </div>
  )
}

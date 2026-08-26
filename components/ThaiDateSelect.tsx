'use client'

import { getTodayBKK } from '@/lib/utils'
import {
  BUDDHIST_ERA_OFFSET,
  daysInMonth,
  mergeIsoDateParts,
  parseIsoDate,
  THAI_MONTHS,
} from '@/lib/thaiDate'

interface ThaiDateSelectProps {
  value: string
  onChange: (value: string) => void
  required?: boolean
  maxDate?: string
  accent?: boolean
}

const YEAR_LOOKBACK = 5

export function ThaiDateSelect({
  value,
  onChange,
  required = false,
  maxDate = getTodayBKK(),
  accent = false,
}: ThaiDateSelectProps) {
  const selected = parseIsoDate(value)
  const maximum = parseIsoDate(maxDate)
  const isMaximumYear = selected.year === maximum.year
  const isMaximumMonth = isMaximumYear && selected.month === maximum.month
  const maxDay = Math.min(daysInMonth(selected.year, selected.month), isMaximumMonth ? maximum.day : 31)
  const earliestYear = Math.min(selected.year, maximum.year - YEAR_LOOKBACK)
  const years = Array.from({ length: maximum.year - earliestYear + 1 }, (_, index) => maximum.year - index)

  function update(change: Parameters<typeof mergeIsoDateParts>[1]) {
    const next = mergeIsoDateParts(value, change)
    onChange(next > maxDate ? maxDate : next)
  }

  const selectClassName = `min-w-0 w-full border rounded-xl px-1 py-2.5 text-sm bg-white ${accent ? 'border-2' : ''}`
  const selectStyle = { borderColor: accent ? 'var(--flame-red)' : 'var(--border)' }

  return (
    <div className="grid grid-cols-3 gap-2">
      <select aria-label="วัน" required={required} value={selected.day}
        onChange={event => update({ day: Number(event.target.value) })}
        className={`${selectClassName} text-center`} style={selectStyle}>
        {Array.from({ length: maxDay }, (_, index) => index + 1).map(day => (
          <option key={day} value={day}>{day}</option>
        ))}
      </select>
      <select aria-label="เดือน" required={required} value={selected.month}
        onChange={event => update({ month: Number(event.target.value) })}
        className={selectClassName} style={selectStyle}>
        {THAI_MONTHS.map((name, index) => (
          (!isMaximumYear || index + 1 <= maximum.month) &&
          <option key={name} value={index + 1}>{name}</option>
        ))}
      </select>
      <select aria-label="ปี" required={required} value={selected.year}
        onChange={event => update({ year: Number(event.target.value) })}
        className={selectClassName} style={selectStyle}>
        {years.map(year => (
          <option key={year} value={year}>{year + BUDDHIST_ERA_OFFSET}</option>
        ))}
      </select>
    </div>
  )
}

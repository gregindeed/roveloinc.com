export type Granularity = 'year' | 'quarter' | 'month' | 'day'

export type Period = {
  label: string
  from: string // YYYY-MM-DD inclusive
  to: string // YYYY-MM-DD inclusive
  year: number
  granularity: Granularity
  q?: number
  month?: number
  day?: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate()
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type PeriodParams = { year?: string; q?: string; month?: string; day?: string }

export function parsePeriod(params: PeriodParams, fallbackYear: number): Period {
  const year = parseInt(params.year || '', 10) || fallbackYear

  const day = params.day
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const [, m, d] = day.split('-')
    return {
      label: `${MON[Number(m) - 1]} ${Number(d)}, ${year}`,
      from: day,
      to: day,
      year,
      granularity: 'day',
      day,
    }
  }

  const month = parseInt(params.month || '', 10)
  if (month >= 1 && month <= 12) {
    return {
      label: `${MONTHS[month - 1]} ${year}`,
      from: `${year}-${pad(month)}-01`,
      to: `${year}-${pad(month)}-${pad(lastDay(year, month))}`,
      year,
      granularity: 'month',
      month,
    }
  }

  const q = parseInt(params.q || '', 10)
  if (q >= 1 && q <= 4) {
    const m1 = (q - 1) * 3 + 1
    const m3 = m1 + 2
    return {
      label: `Q${q} ${year}`,
      from: `${year}-${pad(m1)}-01`,
      to: `${year}-${pad(m3)}-${pad(lastDay(year, m3))}`,
      year,
      granularity: 'quarter',
      q,
    }
  }

  return {
    label: `${year}`,
    from: `${year}-01-01`,
    to: `${year}-12-31`,
    year,
    granularity: 'year',
  }
}

/** Keep rows whose YYYY-MM-DD date falls within the period (inclusive). */
export function inPeriod(dateStr: string | null | undefined, p: Period): boolean {
  if (!dateStr) return false
  return dateStr >= p.from && dateStr <= p.to
}

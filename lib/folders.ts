// Fixed category folders shown inside every year folder.
// `folder` on a document row stores the slug.

export type DocCategory = {
  slug: string
  label: string
}

// Current-year SOURCE documents only (year -> category -> month).
// Books-aligned: mirrors the Transactions/Expenses structure.
export const DOC_CATEGORIES: DocCategory[] = [
  { slug: 'bank_statements', label: 'Bank Statements' },
  { slug: 'credit_card', label: 'Credit Card Statements' },
  { slug: 'income', label: 'Income' },
  { slug: 'expenses', label: 'Expenses' },
  { slug: 'payroll', label: 'Payroll' },
  { slug: 'other', label: 'Other' },
]

// Special folders that live OUTSIDE the year->month source structure.
export const PERMANENT_FOLDER = 'permanent' // entity/permanent file, on Account details
export const AGENCY_FOLDER = 'agency_notices' // compliance correspondence, on Compliance tab

const EXTRA_LABELS: Record<string, string> = {
  [PERMANENT_FOLDER]: 'Formation & Legal',
  [AGENCY_FOLDER]: 'Agency Notices',
}

export function categoryLabel(slug: string | null | undefined): string {
  if (!slug) return 'Unfiled'
  return DOC_CATEGORIES.find((c) => c.slug === slug)?.label ?? EXTRA_LABELS[slug] ?? slug
}

export const MONTHS: { n: number; label: string; short: string }[] = [
  { n: 1, label: 'January', short: 'Jan' },
  { n: 2, label: 'February', short: 'Feb' },
  { n: 3, label: 'March', short: 'Mar' },
  { n: 4, label: 'April', short: 'Apr' },
  { n: 5, label: 'May', short: 'May' },
  { n: 6, label: 'June', short: 'Jun' },
  { n: 7, label: 'July', short: 'Jul' },
  { n: 8, label: 'August', short: 'Aug' },
  { n: 9, label: 'September', short: 'Sep' },
  { n: 10, label: 'October', short: 'Oct' },
  { n: 11, label: 'November', short: 'Nov' },
  { n: 12, label: 'December', short: 'Dec' },
]

export function monthLabel(n: number | null | undefined): string {
  if (!n) return 'Unsorted'
  return MONTHS.find((m) => m.n === n)?.label ?? String(n)
}

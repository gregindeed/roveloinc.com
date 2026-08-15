import type { SalesEntry, Deposit, CheckingExpense, CCTransaction, Account, SaleTender } from '@/lib/types'

// ── Reconciliation engine (sales journal ↔ bank) ─────────────────────────────
// Ties what was SOLD (sales_entries, by tender) to what hit the BANK (deposits),
// at the period + tender-lane level. We don't have processor batch files, so we
// reconcile lanes rather than matching each card batch to its exact settlement —
// a legitimate, honest bookkeeping reconciliation.
//
// Card/Clover sales settle NET of processor fees, so gross card sales exceed the
// card deposit by the fee; the engine derives that fee from the gap and shows it
// (and cross-checks it against merchant-fee expense already booked).

export type Lane = 'card' | 'cash' | 'check' | 'other'
export const LANES: Lane[] = ['card', 'cash', 'check', 'other']
export const LANE_LABELS: Record<Lane, string> = { card: 'Card', cash: 'Cash', check: 'Check', other: 'Other / ACH' }

function tenderLane(t: SaleTender): Lane {
  if (t === 'card') return 'card'
  if (t === 'cash') return 'cash'
  if (t === 'check') return 'check'
  return 'other' // ach, financing, other
}

// Best-effort classification of a bank deposit into a tender lane by description.
const CARD_RE = /clover|square|stripe|toast|tsys|fiserv|worldpay|elavon|global\s?payments|merchant|bankcard|bank\s?card|card\s?(?:settle|deposit|service)|cardconnect|paypal|venmo/i
const CHECK_RE = /mobile deposit|remote deposit|check deposit|deposited check|\brdc\b/i
const OTHER_RE = /\bach\b|financ|lend|\bloan\b|dealer|westlake|santander|credit acceptance/i
const CASH_RE = /cash|atm deposit|branch deposit|teller/i

export function depositLane(description: string | null | undefined): Lane | 'unclassified' {
  const d = description || ''
  if (CARD_RE.test(d)) return 'card'
  if (CHECK_RE.test(d)) return 'check'
  if (OTHER_RE.test(d)) return 'other'
  if (CASH_RE.test(d)) return 'cash'
  return 'unclassified'
}

export type LaneRow = { lane: Lane; sales: number; deposits: number; diff: number }

export type Reconciliation = {
  lanes: LaneRow[]
  salesTotal: number
  depositsClassified: number
  unclassifiedDeposits: number
  unclassifiedCount: number
  impliedCardFee: number
  impliedCardFeePct: number | null
  bookedMerchantFees: number
  timingSales: number
  variance: number // (sales − implied card fees) − classified sales deposits
}

function shiftDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function reconcile(
  sales: SalesEntry[],
  deposits: Deposit[],
  checking: CheckingExpense[],
  cc: CCTransaction[],
  accounts: Account[],
  range: { from: string; to: string }
): Reconciliation {
  const salesByLane: Record<Lane, number> = { card: 0, cash: 0, check: 0, other: 0 }
  for (const s of sales) salesByLane[tenderLane(s.tender)] += Number(s.amount)

  const depByLane: Record<Lane, number> = { card: 0, cash: 0, check: 0, other: 0 }
  let unclassified = 0
  let unclassifiedCount = 0
  for (const d of deposits) {
    const lane = depositLane(d.description)
    if (lane === 'unclassified') {
      unclassified += Number(d.amount)
      unclassifiedCount++
    } else {
      depByLane[lane] += Number(d.amount)
    }
  }

  const lanes: LaneRow[] = LANES.map((lane) => ({
    lane,
    sales: salesByLane[lane],
    deposits: depByLane[lane],
    diff: salesByLane[lane] - depByLane[lane],
  }))

  const salesTotal = LANES.reduce((a, l) => a + salesByLane[l], 0)
  const depositsClassified = LANES.reduce((a, l) => a + depByLane[l], 0)

  const impliedCardFee = Math.max(0, salesByLane.card - depByLane.card)
  const impliedCardFeePct = salesByLane.card > 0 ? impliedCardFee / salesByLane.card : null

  // Merchant-fee expense already booked (bank/card/processing fee accounts).
  const feeAcctIds = new Set(
    accounts
      .filter((a) => a.type === 'expense' && /merchant|bank.*fee|processing|card.*fee/i.test(a.name))
      .map((a) => a.id)
  )
  const bookedMerchantFees =
    checking.filter((r) => r.account_id && feeAcctIds.has(r.account_id)).reduce((a, r) => a + Number(r.amount), 0) +
    cc.filter((r) => r.account_id && feeAcctIds.has(r.account_id)).reduce((a, r) => a + Number(r.amount), 0)

  // Sales recorded in the last few days of the period likely settle next period.
  const cutoff = shiftDays(range.to, -3)
  const timingSales = sales.filter((s) => s.entry_date > cutoff).reduce((a, s) => a + Number(s.amount), 0)

  const variance = salesTotal - impliedCardFee - depositsClassified

  return {
    lanes,
    salesTotal,
    depositsClassified,
    unclassifiedDeposits: unclassified,
    unclassifiedCount,
    impliedCardFee,
    impliedCardFeePct,
    bookedMerchantFees,
    timingSales,
    variance,
  }
}

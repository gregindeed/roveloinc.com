import type { Deposit, CheckingExpense, CCTransaction, Account } from '@/lib/types'

// A single account line in a P&L section.
export type PnlLine = { key: string; label: string; total: number }
export type PnlSection = { lines: PnlLine[]; uncategorized: number; total: number }

export type Pnl = {
  revenue: PnlSection
  cogs: PnlSection
  grossProfit: number
  opex: PnlSection
  net: number
  // Correctly excluded from the income statement:
  excluded: { ownerDraw: number; cardPayments: number; other: number }
  // Card activity not yet categorized — held OUT of the P&L to avoid double-
  // counting card payments until the user assigns accounts.
  uncategorizedCard: number
  uncategorizedCount: number
  personalFlagged: number
  hasActivity: boolean
}

type Row = { amount: number; account_id: string | null; source: 'deposit' | 'checking' | 'cc' }

// Build an income statement by account for a set of period-filtered transactions.
//
// Categorized rows are classified by their account's type. Uncategorized bank
// rows fall back to their natural side (deposits = income, checking = expense)
// so the top line stays meaningful before categorization; uncategorized CARD
// rows are held out entirely (a card payment and its charge would otherwise
// double-count) and surfaced separately as a prompt to categorize.
export function computePnl(
  deposits: Deposit[],
  checking: CheckingExpense[],
  cc: CCTransaction[],
  accounts: Account[]
): Pnl {
  const byId = new Map(accounts.map((a) => [a.id, a]))
  const rev = new Map<string, PnlLine>()
  const cogs = new Map<string, PnlLine>()
  const opex = new Map<string, PnlLine>()
  let revUncat = 0
  let opexUncat = 0
  let ownerDraw = 0
  let cardPayments = 0
  let otherExcluded = 0
  let uncategorizedCard = 0
  let uncategorizedCount = 0

  const bump = (m: Map<string, PnlLine>, a: Account, amt: number) => {
    const cur = m.get(a.id) ?? { key: a.id, label: `${a.code} · ${a.name}`, total: 0 }
    cur.total += amt
    m.set(a.id, cur)
  }

  const rows: Row[] = [
    ...deposits.map((r) => ({ amount: Number(r.amount), account_id: r.account_id, source: 'deposit' as const })),
    ...checking.map((r) => ({ amount: Number(r.amount), account_id: r.account_id, source: 'checking' as const })),
    ...cc.map((r) => ({ amount: Number(r.amount), account_id: r.account_id, source: 'cc' as const })),
  ]

  for (const row of rows) {
    const acct = row.account_id ? byId.get(row.account_id) : undefined
    if (acct) {
      switch (acct.type) {
        case 'income':
          bump(rev, acct, row.amount)
          break
        case 'cogs':
          bump(cogs, acct, row.amount)
          break
        case 'expense':
          bump(opex, acct, row.amount)
          break
        case 'equity':
          ownerDraw += row.amount
          break
        case 'liability':
          cardPayments += row.amount
          break
        case 'asset':
          otherExcluded += row.amount
          break
      }
    } else {
      uncategorizedCount++
      if (row.source === 'deposit') revUncat += row.amount
      else if (row.source === 'checking') opexUncat += row.amount
      else uncategorizedCard += row.amount
    }
  }

  const personalFlagged = cc
    .filter((r) => r.personal && !r.account_id)
    .reduce((a, r) => a + Number(r.amount), 0)

  const section = (m: Map<string, PnlLine>, uncat: number): PnlSection => {
    const lines = [...m.values()].sort((a, b) => b.total - a.total)
    const total = lines.reduce((a, l) => a + l.total, 0) + uncat
    return { lines, uncategorized: uncat, total }
  }

  const revenue = section(rev, revUncat)
  const cogsS = section(cogs, 0)
  const opexS = section(opex, opexUncat)
  const grossProfit = revenue.total - cogsS.total
  const net = grossProfit - opexS.total

  return {
    revenue,
    cogs: cogsS,
    grossProfit,
    opex: opexS,
    net,
    excluded: { ownerDraw, cardPayments, other: otherExcluded },
    uncategorizedCard,
    uncategorizedCount,
    personalFlagged,
    hasActivity: rows.length > 0,
  }
}

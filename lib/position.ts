import type { Deposit, CheckingExpense, CCTransaction, Account, StatementImportRow } from '@/lib/types'
import { computePnl } from '@/lib/pnl'

// ── Financial Position (simplified) ──────────────────────────────────────────
// This system records transaction ACTIVITY (cash basis), not running account
// balances or opening balances, so a full GAAP balance sheet that ties to zero
// isn't derivable. What we CAN show honestly, from what's recorded:
//   • Cash on hand — the closing balance of the most recent reconciled BANK
//     statement (the one real balance the system holds).
//   • Net income for the period — straight from the P&L.
//   • Owner's equity movement — contributions in / draws out (equity postings).
//   • Net movement in liabilities and other assets (informational).
// It is deliberately labeled "simplified" wherever shown — it is NOT a balance
// sheet, and the UI says so.

export type FinancialPosition = {
  cash: number | null
  cashAsOf: string | null // period_end of the statement the cash figure came from
  netIncome: number
  ownerEquityMovement: number // net equity postings (contributions positive, draws negative)
  liabilitiesMovement: number // net liability postings (e.g. card balance paid down)
  otherAssetsMovement: number // net asset postings (transfers)
  hasCash: boolean
}

export function computePosition(
  deposits: Deposit[],
  checking: CheckingExpense[],
  cc: CCTransaction[],
  accounts: Account[],
  statements: StatementImportRow[]
): FinancialPosition {
  const pnl = computePnl(deposits, checking, cc, accounts)

  const latestBank = statements
    .filter((s) => (s.statement_type ?? 'bank') === 'bank' && s.closing_balance != null)
    .sort((a, b) => ((a.period_end ?? '') < (b.period_end ?? '') ? 1 : -1))[0]

  return {
    cash: latestBank?.closing_balance ?? null,
    cashAsOf: latestBank?.period_end ?? null,
    netIncome: pnl.net,
    ownerEquityMovement: pnl.excluded.ownerDraw,
    liabilitiesMovement: pnl.excluded.cardPayments,
    otherAssetsMovement: pnl.excluded.other,
    hasCash: latestBank?.closing_balance != null,
  }
}

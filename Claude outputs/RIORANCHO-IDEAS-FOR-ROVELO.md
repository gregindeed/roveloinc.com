# Ideas worth porting from riorancho-app → roveloinc.com

Captured 2026-09-11, after reviewing the Rio Rancho tenant portal running locally.

Rio Rancho is a bilingual (Spanish) property portal on a newer stack (Next 16 / React 19 /
Tailwind 4, Supabase, OpenNext → Cloudflare). Its **tenant-facing** side is the interesting part —
roveloinc's property module today is entirely manager-side, so several of Rio Rancho's screens fill
real gaps. This note captures the reusable ideas and how they'd map onto roveloinc's existing code.

---

## Priority 1 — Documents shelf (tenant-visible statements, receipts, contracts, notices)

**What Rio Rancho does:** a single "Documentos" page that lists every document tied to the
property — Estados de Cuenta (monthly statements), Recibos (payment receipts), Contratos, and Avisos —
with category filter chips (Todos / Estados de Cuenta / Recibos / Contratos / Avisos), a search box,
a colored type tag per row, and a download button on each.

**Why it fits roveloinc:** roveloinc already has most of the plumbing.
- `property_documents` table (property_id / unit_id / lease_id, storage_path, `doc_kind`) + the
  `client-docs` storage bucket + signed URLs already exist.
- `DOC_KIND_LABELS` already classifies documents — it just needs a `statement` and `notice` kind
  alongside the existing `lease_agreement` / receipt kinds.
- roveloinc already **generates numbered receipts** on every recorded payment (`rent_receipt_seq`,
  `RCPT-…`) — today they're only emailed. Persisting each one as a `property_documents` row of kind
  `receipt` is the missing link that makes this shelf populate itself.

**Build sketch (when we do it):**
1. On `recordPayment`, also write a `property_documents` row (kind `receipt`, the RCPT- number, a
   generated PDF/HTML in `client-docs`). Same for `sendRentInvoice` → kind `invoice`.
2. Add a **statement generator**: per lease, per month, roll charges+payments into an "Estado de
   Cuenta" document. This is the one genuinely new piece.
3. Reuse the existing `DocumentsSection` in `app/admin/properties/[id]/page.tsx`, but add Rio
   Rancho's category-chip + search + type-tag layout. Scope it to a lease for the tenant-facing view.
4. Category tags map cleanly: statement → blue, receipt → green, contract/lease → purple, notice → amber.

---

## Priority 2 — Payment-health donut ("Resumen de Pagos")

**What Rio Rancho does:** a donut ring showing "% Pagado" (e.g. 67%) next to four tiles — Total
Facturado, Total Pagado, Saldo Pendiente, Pagos Realizados — plus a "next payment / last payment /
pending balance" triad of cards at the top of the dashboard.

**Why it fits roveloinc:** every number here is already derivable from roveloinc's per-lease data —
`rent_charges`, the payments table, `effectiveChargeStatus`, and `computeStats`. Nothing new in the
data layer; it's purely a visualization.

**Build sketch:**
1. A small **pure-SVG donut** component (Rio Rancho's charts are dependency-free SVG — no library to
   add). Inputs: totalBilled, totalPaid → percent + stroke arc.
2. The four tiles + the next/last/pending triad come straight from the lease's charges/payments.
3. Drop it into `LeaseBlock` in `app/admin/properties/[id]/page.tsx`, above the existing rent tracker,
   so each lease shows its payment health at a glance. Works on the manager side immediately; reused
   as-is if/when the tenant portal lands.

---

## Backlog — good, but bigger or situational

**Tenant-facing portal (the front door).** Rio Rancho's whole `(portal)` route group is a
self-service tenant experience: "Hola, Carlos," their property, balance, history, account. roveloinc
guards `/portal` already but has no tenant role/experience. This is the largest effort (auth + a tenant
role + its own layout) and is the natural home for Priorities 1 & 2 once they exist — which is why
building those two first is the right order.

**Dual USD/MXN currency.** A live exchange-rate context + a `DualPrice` component that shows both
currencies everywhere, with the rate pinned in the header. Genuinely nice, but only pays off if
roveloinc has cross-border owners or tenants. Park until that's a real need.

**Small touches worth lifting whenever we're in the neighborhood:**
- **WhatsApp click-to-chat** icon on phone numbers (one-line `wa.me/…` link) — great for tenant comms.
- **"Al corriente" status chip** + "Cliente desde <month>" on the account/lease summary — cheap,
  readable signal of standing.
- **Self-service "Realizar Pago" CTA** — a pay-now entry point. Real version needs a payment
  processor (Stripe/etc.); the shell/placement is the reusable idea.

---

## Notes

- The local Rio Rancho preview is running on a **local-only auth bypass** (mock data, no login) and
  **webpack** dev — those edits are for looking around, not for deploy. `git checkout` restores the
  real auth. See the bypass comments in `app/(portal)/layout.tsx`, `middleware.ts`, `app/page.tsx`.
- Rio Rancho's Supabase project has been idle ~6 months and its Cloudflare deploy is 6 months old;
  treat the repo as a design/reference source, not a live system.

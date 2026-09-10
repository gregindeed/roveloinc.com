# Property management — recommendation + v1 module

_Built overnight, staged into the repo. **Nothing is deployed and no SQL has been run.** Review, then activate when you're ready._

## The recommendation (the "how")

**Build it inside roveloinc.com as a parallel module. Don't resurrect propframe. Don't go standalone.**

I went through the whole `propframe` project first. Here's what it actually is:

- It's an **empty SaaS shell** — a marketing landing page, a signup/signin flow, and an admin page that lists "companies." Its only data types are `Company` and `CompanyMember`. There are **no units, tenants, leases, payments, invoices, or receipts anywhere.** The property-management product was never built.
- It's on a **different, incompatible stack** — Next 15 / React 19 / Tailwind v4 / Cloudflare **Pages** (roveloinc is Next 14.2.35 / OpenNext → **Workers**), a **separate Supabase project** (`phxzrhdzsxqaamwbbddr`), client-side `supabase-js` with no SSR/RLS/middleware, and a dark indigo theme under the "Drk Matter Labs / propframe.drkm.io" brand.

So there is essentially nothing to lift from it. Porting it would mean rebuilding the actual features anyway, on a second stack, second Supabase project, second auth system, second design language, and second deploy pipeline — double the maintenance forever.

Meanwhile the people who'd use rent tracking are **already in roveloinc.com**: Rovelo's own book (Rovelo as a client entity that owns property) and portal clients who happen to be landlords. Property naturally hangs off an **owner** — and an owner is just a `client` entity you already model. Putting properties here means one auth system, one Supabase (now on Pro), one deploy, the existing portal for tenants-of-clients later, RLS already solved, and the design system already built.

propframe was a separate _product_ play (a SaaS to sell to strangers). What you're asking for now is _internal_ property management for Rovelo and its clients. That's a module of this app, not a second business. If you later decide to sell property management as a standalone SaaS, this module becomes the proven core you'd spin out — but you don't pay the "two of everything" tax until there's a reason to.

## The data model

Everything hangs off an existing client entity (the **landlord/owner**) via `client_id`, so it reuses the exact tenant scoping, RLS, and portal-client read access as the rest of the app.

```
client (the landlord — a business or an individual you already have)
  └── property            a building / address
        └── unit          a rentable space (a single-family rental is one unit)
              └── lease   a tenancy: who rents it, rent amount, due day, deposit
                    └── rent_charge   one month's rent line — the payment tracker
```

Four new tables — `properties`, `units`, `leases`, `rent_charges` — each RLS-scoped with the same `can_write_entity()` / `can_read_entity()` helpers every other client-scoped table uses. Workers (you and managers, plus granted collaborators) get full read/write; the portal client who owns the entity automatically gets **read** access to their own portfolio, which sets up portal exposure later with no schema change.

## What v1 does

- **Onboard a property** and attach it to an owner entity (`/admin/properties/new`).
- **Add units** to a property (label, beds/baths/sqft, market rent).
- **Add a tenant** to a unit — a lease with rent amount, deposit, due day, start/end.
- **Schedule rent** — generate N months of rent-charge lines from a lease in one click. Each month gets a unique **invoice number** (`INV-000123`).
- **Track payments** — you record each payment by hand (check, cash, Zelle — there's no auto-pay yet). Every payment is its own row with a unique **receipt number** (`RCPT-000123`); the month's status auto-rolls to `paid` / `partial` / `overdue`. **A numbered receipt is emailed to the tenant automatically on save** (there's a per-payment opt-out, and it no-ops if the lease has no email).
- **Automated rent reminders** — the daily cron (6 AM Pacific) emails each tenant when rent is coming due (per-property lead time) and again while it's overdue, with that property's **payment instructions** (Zelle, bank/ACH, check, other). De-duped so nobody gets nagged more than ~weekly. Per-property on/off toggle.
- **Manual invoice + numbered receipt emails** — "Send invoice" emails a numbered invoice with payment instructions on demand; recording a payment can email a numbered receipt. All reuse your existing Resend setup and house email style.
- **Payment instructions per property** — set how tenants pay once; it flows into every invoice, reminder, and receipt.
- **Portfolio view** (`/admin/properties`) — every property with occupancy, monthly rent roll, collected-this-month vs due, and outstanding balance; plus portfolio-wide totals.
- A **Properties** link now appears in the admin top nav.

Invoice/receipt numbers come from Postgres sequences (`rent_invoice_seq`, `rent_receipt_seq`) so they're unique and monotonic. Interactions are plain server-action forms (progressive enhancement, no new client-side JS), matching how the rest of admin works.

## Files

**New**
- `supabase/properties.sql` — five tables (`properties`, `units`, `leases`, `rent_charges`, `rent_payments`) + two numbering sequences + RLS (run this once)
- `lib/property.ts` — types, labels, pure formatters/date helpers, payment-instruction helper
- `lib/propertyServer.ts` — data fetching + stat roll-ups (RLS-scoped)
- `lib/propertyEmail.ts` — rent invoice / reminder / numbered receipt email bodies
- `lib/rentReminders.ts` — the automated-reminder engine (called by the cron)
- `app/admin/properties/actions.ts` — server actions (create/record/send/settings/etc.)
- `app/admin/properties/page.tsx` — portfolio
- `app/admin/properties/new/page.tsx` — onboard a property
- `app/admin/properties/[id]/page.tsx` — manage units, tenants, rent tracker, payment settings

**Modified**
- `app/admin/page.tsx` — added the "Properties" nav link (one line)
- `app/api/cron/route.ts` — added the rent-reminders step to the existing daily cron

## Owner quick-add · Google Maps · Overseer (added)

- **Add an owner without leaving the page.** The New property form has a "+ Owner not listed? Add one" quick-create that makes a real entity (name, business/individual, contact) and preselects it. It also shows up in your normal clients roster. Managers/owner only.
- **Google Maps address + auto photo.** The address field is a Google Places autocomplete that captures the formatted address, `place_id`, and lat/lng. Each property then shows an automatic photo — Street View where it exists, falling back to a satellite map — on the portfolio cards and the property page. Wired to `NEXT_PUBLIC_GOOGLE_MAPS_KEY`; if the key is missing it quietly degrades to a plain address field.
- **Overseer reads the properties.** Each owning entity's Overseer overview now includes a `real_estate` block — properties (address, type, units, occupancy, monthly rent) plus the portfolio's rent roll and outstanding balance, **and the free-text notes on each property**. Regenerating that entity's Overseer read folds its real estate into the brief.

### Google Maps setup
The Maps key lives in `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (already in `.env.local`). For it to work, the key needs these APIs enabled in Google Cloud: **Maps JavaScript API** + **Places API** (address autocomplete), **Street View Static API** and **Maps Static API** (the photos). Add the same `NEXT_PUBLIC_GOOGLE_MAPS_KEY` to your **Cloudflare** project env vars so it works in production too (it's a public/browser key, so exposure is expected — just restrict it by HTTP referrer in Google Cloud).

## Activate it (in this order)

1. **Run the SQL.** Open Supabase → SQL editor → paste `supabase/properties.sql` → run. It needs the helper functions from `access.sql`, which are already in your DB. Safe to re-run.
2. **Typecheck + deploy** with your normal flow (stop `npm run dev` first):
   ```
   npx tsc --noEmit
   rm -rf .next .open-next node_modules/.cache && npm run deploy
   ```
   The four logic files already pass a strict isolated typecheck; `npx tsc --noEmit` against the full repo is the final gate.
3. Visit **/admin/properties**, onboard a property against one of your entities, add a unit + tenant, hit **Schedule rent**, and try **Record payment** and **Send invoice**.
4. On the property page, open **"How tenants pay & reminders"** and fill in your Zelle / bank / check details — those flow into every invoice, reminder, and receipt.

**About the automated reminders:** they ride your existing daily cron (`/api/cron`, 6 AM Pacific). The separate cron-worker already calls that endpoint on schedule, so **no change to the cron-worker is needed** — just deploy the app (step 2) and the reminder step is live. A property must have `auto_reminders` on (default) and a tenant email on the lease. Reminders start within the property's "days before due" window and repeat about weekly while unpaid; the run reports how many it sent in the cron JSON (`rentReminders`).

## Open decisions for the morning (nothing blocking)

- **Portal exposure.** RLS already lets a portal client _read_ their own properties. Do you want a read-only "Properties / Rent" tab in the client portal for landlord-clients? (Phase 2 — small.)
- **Rovelo's own properties.** Simplest path is one client entity representing Rovelo-as-landlord (or reuse an existing one). Want me to set that up, or keep properties attached to whichever client entity you choose per property?
- **i18n.** I used plain English strings to avoid touching the big `lib/i18n.ts` overnight. If you want the module bilingual like the rest, I'll add the keys.
- **Overseer.** Could later summarize a portfolio ("2 units late this month, $3,400 outstanding") the same way the entity Overseer brief works. Not built yet.
- **Automation.** Auto-generate next month's rent charges on a schedule, and auto-flag overdue — easy to add with your existing cron route.

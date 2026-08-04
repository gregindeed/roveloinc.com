# Deploying roveloinc.com to Cloudflare (Workers, via OpenNext)

The app is a server-rendered Next.js app, so it deploys to **Cloudflare Workers**
using the OpenNext adapter (not the old static Pages setup). Do these steps from
the project folder on your Mac.

---

## 0. One-time prerequisite — remove the old exposed portal ⚠️

The old client-side portal still contains the hardcoded data and the `Reyes2026`
password. If it ships, it re-exposes everything. Delete it (and stray files)
before deploying:

```bash
cd ~/Documents/roveloinc.com
git rm -r "app/reyes-tires-inc" "app/(site)"
git rm index.html build_bookkeeping.py
git rm --cached Reyes_Tires_Inc_April2026_Bookkeeping.xlsx "Reyes_Tires_Inc_APR2026_Workbook.xlsx" 2>/dev/null || true
```

(`.gitignore` now ignores `*.xlsx`, so the workbooks stay on your disk but are
never committed again.)

---

## 1. Install dependencies

```bash
npm install
```

## 2. Log in to Cloudflare

```bash
npx wrangler login
```

## 3. First deploy (creates the Worker "roveloinc-portal")

```bash
npm run deploy
```

The build reads `.env.local` for the two **public** values
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) and bakes them in —
so make sure `.env.local` is present and correct when you run this.

## 4. Set the two runtime secrets

These are NOT baked into the build (that's the point — they stay secret). Set
them on the Worker, then they're live:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put RESEND_API_KEY
```

(Each prompts you to paste the value. You can also set them in the dashboard:
Workers & Pages → roveloinc-portal → Settings → Variables and Secrets.)

Optional: `npx wrangler secret put EMAIL_FROM` if you want a from-address other
than the default `Rovelo Inc <noreply@roveloinc.com>`.

## 5. Point roveloinc.com at the new Worker

Your domain is currently attached to the **old Pages project**. Move it:

1. Workers & Pages → the old **Pages** project → Custom domains → remove `roveloinc.com`.
2. Workers & Pages → **roveloinc-portal** (Worker) → Settings → Domains & Routes →
   Add → Custom Domain → `roveloinc.com`. DNS is already on Cloudflare, so it
   provisions automatically in a minute or two.

## 6. Tell Supabase the production URL

Supabase → Authentication → URL Configuration:
- **Site URL:** `https://roveloinc.com`
- **Redirect URLs:** add `https://roveloinc.com/**`

(Your onboarding invite link already uses the live request host, so it works in
both dev and prod — this step is for Supabase's own auth emails.)

## 7. Test

Visit `https://roveloinc.com` → Client Login → sign in as admin → open a client →
confirm books, documents, and onboarding all work. Onboard a test client and
check the invite email arrives from your domain.

---

## Redeploying later

Just `npm run deploy` again. To keep the local build environment working:

- `.dev.vars` (create it) can hold `NEXTJS_ENV=development` for `next dev`.
- The old Pages project can be deleted once the Worker is serving the domain —
  otherwise pushes to GitHub will trigger (harmless) failed Pages builds.

## Continuous deploys from GitHub (optional, later)

Instead of CLI deploys, you can connect the repo to a Worker via
Workers Builds (dashboard → the Worker → Settings → Build) so every push to
`main` deploys automatically — the modern equivalent of what Pages was doing.

// ── Rovelo cron worker ───────────────────────────────────────────────────────
// A tiny standalone Cloudflare Worker whose only job is to hit the main app's
// /api/cron endpoint on a schedule. It's separate from the OpenNext app worker
// (which only handles `fetch`), so the always-on heartbeat doesn't touch the
// Next build. Zero Anthropic tokens — the endpoint it calls is pure compute +
// Resend email.
//
// Deploy once, from this folder:
//   npx wrangler deploy
//   npx wrangler secret put CRON_SECRET     # same value as the app's CRON_SECRET
//
// The schedule lives in wrangler.jsonc (triggers.crons).

export default {
  async scheduled(event, env, ctx) {
    // Pass the shared secret in an Authorization header (not the URL) so it never
    // lands in access/proxy logs. We control both ends, so a header is possible
    // here (unlike the Plaid webhook, where Plaid dictates the request).
    const url = `${env.APP_URL}/api/cron`
    ctx.waitUntil(
      fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${env.CRON_SECRET}` } })
        .then((r) => r.text())
        .then((t) => console.log('cron ->', t.slice(0, 200)))
        .catch((e) => console.log('cron error', String(e)))
    )
  },
}

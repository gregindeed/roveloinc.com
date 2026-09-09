// Request headers the middleware attaches AFTER it has authoritatively validated
// the session (via supabase.auth.getUser()). On guarded routes (/admin, /portal)
// a server render can trust these instead of validating the token a second time —
// saving an auth-server round-trip per navigation.
//
// SECURITY: the middleware STRIPS any inbound copy of these headers on every
// request it handles (guarded or not), so a client can never forge them. A page
// therefore only ever sees them when the middleware itself set them, immediately
// after validation. On routes the middleware does not guard, the headers are
// absent and getViewer() falls back to validating the token itself.
//
// This module is intentionally dependency-free so it is safe to import from both
// the Edge middleware and Node server code.
export const VIEWER_ID_HEADER = 'x-viewer-id'
export const VIEWER_EMAIL_HEADER = 'x-viewer-email'

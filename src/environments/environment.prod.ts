// Production environment. apiOrigin is empty so the app talks to the same
// origin it is served from (the Kamal deployment serves the SPA and the
// Rails API behind one host). Override here if the API moves to its own
// subdomain, e.g. "https://api.fitora.io".
export const environment = {
  production: true,
  apiOrigin: "",
  // A Sentry DSN is not a secret — it's meant to be embedded in
  // client-side bundles (it only lets a client SEND events, never read
  // anything back) — safe to commit here, unlike an API key. Unlike
  // backend/config/deploy.yml's <PLACEHOLDER> values, leaving this blank
  // is a genuinely valid, intentional state, not a "fill me in or it
  // breaks" marker: Sentry.init() with an empty DSN safely no-ops, so no
  // error tracking runs until a real DSN replaces this string.
  sentryDsn: "",
};

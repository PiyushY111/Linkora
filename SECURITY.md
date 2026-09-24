# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub:
**Security → Report a vulnerability** on
[PiyushY111/Linkora](https://github.com/PiyushY111/Linkora/security/advisories/new).
Don't open a public issue for a security problem.

Include what you found, how to reproduce it, and the impact you expect. You
should get a first response within a week. Only the `main` branch is
supported; there are no maintained release branches.

## Scope

In scope: the API (`backend/`), the click consumer, and the dashboard
(`frontend/`). Areas that have had security-specific work, and are good
places to look:

- origin allowlist for CORS and CSRF: `backend/src/lib/originPolicy.js`
- SSRF checks for link destinations and webhook delivery:
  `backend/src/lib/ipBlocklist.js`, `backend/src/lib/ssrfSafeDispatcher.js`
- tokens: `backend/src/utils/jwt.js`, `backend/src/middleware/auth.js`
- API keys: `backend/src/middleware/apiKeyAuth.js`
- client IP and rate limits: `backend/src/utils/helpers.js`,
  `backend/src/middleware/rateLimiter.js`

Known weaknesses that are already tracked are in
[docs/KNOWN_BUGS.md](docs/KNOWN_BUGS.md) (for example, the access token is
stored in `localStorage`). Reports that go beyond those are still welcome.

## Deployment notes

- Set `TRUST_PROXY_HOPS` to the number of proxies in front of the API.
  Too high lets clients spoof their IP and dodge rate limits.
- List every browser origin that should reach the API in `FRONTEND_URL` or
  `ALLOWED_ORIGINS`; nothing else is trusted.
- Never set `WEBHOOK_ALLOW_PRIVATE_TARGETS=true` outside local development
  (the server refuses to start with it in production).
- Set `METRICS_TOKEN`, or `/metrics` is unavailable in production.
- Run Redis with `maxmemory-policy noeviction`.

## Dependency advisories

`npm audit --audit-level=high` passes in both packages. Remaining
moderate advisories, reviewed and accepted:

| Package | Advisory | Why it is accepted |
|---|---|---|
| `uuid` < 11.1.1 (via `node-cron` 3) | Missing buffer bounds check in v3/v5/v6 when a `buf` argument is passed | `node-cron` only calls `uuid.v4()` with no buffer. Removing it needs the `node-cron` 4 major upgrade. |
| `react-router` < 7.18 (via `react-router-dom` 6) | Open redirect via backslash in `<Link>`/`useNavigate`; SSR hydration constructor injection | Every navigation target in the app comes from static route definitions, never user input, and the app does not use SSR. Removing it needs the React Router 7 major upgrade. |

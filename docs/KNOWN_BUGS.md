# Known Bugs

Behavior that is known to be wrong and not fixed yet. Each entry names where it lives and when it's scheduled. This file must be empty before the project is called done.

| # | Bug | Where | Scheduled |
|---|---|---|---|
| 1 | The `Analytics` document is still created per link and populated on link reads, but nothing updates its counters, so anything reading `link.analytics.summary` sees zeros | `backend/src/models/Analytics.js`, `linkController.js` | Step 5 (delete it, or derive it from the analytics repository) |
| 2 | A Bearer JWT with no or a masked API key gets scope `['*']` on the public API, bypassing API-key scopes | `backend/src/middleware/apiKeyAuth.js` | Step 7 |
| 3 | `createLinkRecord` has no type validation (`ogTitle: 123` throws a TypeError, reported as a generic failure) and lets clients set `variants[].clicks`, `qrCode`, and the whole `utm` object | `backend/src/controllers/linkController.js` | Step 5 (zod `validate()`) |
| 4 | A/B `variants.$.clicks` is incremented on the redirect hot path, without idempotency and separately from the click pipeline | `backend/src/controllers/analyticsController.js` | Step 3 |
| 5 | Body-parser 4xx errors (malformed JSON, 413) are returned as 500 | `backend/src/middleware/error.js` | Step 8 (error envelope) |
| 6 | Click stream entries carry the raw IP, full user agent and **full referer URL** (whose query string can hold tokens) until consumed or trimmed. The consumer only persists an IP hash and the referrer domain, but Redis holds the raw values in the meantime. Hash the IP and reduce the referer to its domain before `XADD`. | `backend/src/controllers/analyticsController.js` (`emitClickEvent`) | Step 3 |

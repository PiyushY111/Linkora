# ⚡ Linkora

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-C6FF3D.svg?style=for-the-badge&logoColor=0A0A0B)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.0+-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://mongodb.com)
[![Redis](https://img.shields.io/badge/Redis-7.0+-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

**URL Infrastructure, Click Analytics on MongoDB, HMAC Webhook Delivery & Developer Platform**

[Features](#-key-features) • [Developer Section & CLI](#-developer-portal--in-browser-cli) • [Webhooks Engine](#-enterprise-webhook-system) • [Architecture](#-architecture) • [Getting Started](#-getting-started) • [API Reference](#-public-api-v1-reference)

</div>

---

## 🌟 Overview

**Linkora** is an enterprise-grade URL shortening and programmatic link intelligence platform. Designed to rival and surpass systems like Bitly and Dub.co, Linkora provides sub-millisecond cached redirects, asynchronous click ingestion into MongoDB via a Redis stream, automated exponential-backoff webhooks with HMAC-SHA256 signatures, an in-browser interactive developer CLI (`linkora-cli`), and a multi-tab configuration hub.

---

## 🚀 Key Features

### 1. 🔗 Advanced Link Provisioning
* **Ultra-Fast Redirect Engine**: Sub-millisecond redirects powered by multi-tier Redis caching.
* **Custom Aliases & Dynamic Slugs**: Generate memorable short codes or specify custom brand slugs.
* **Granular Link Controls**:
  * **Password Protection**: Secure sensitive URLs with bcrypt-hashed passcodes.
  * **Click Limit Throttling**: Auto-disable links once maximum traffic thresholds are reached.
  * **Time-Based Expiration**: Define explicit TTL expiration dates.
  * **Device Targeting**: Direct iOS and Android visitors to native App Store or Play Store deep links.
  * **Built-in UTM Campaign Builder**: Automatically append `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, and `utm_content`.
* **Automatic Vector QR Codes**: Real-time scannable QR code generation with download capabilities.

---

### 2. ⚡ Developer Portal & In-Browser CLI
* **Interactive In-Browser CLI (`linkora-cli`)**:
  * Full Unix-style command-line terminal executing live against Linkora's Public API.
  * Tab auto-completion, command history (<kbd>↑</kbd>/<kbd>↓</kbd> arrows), latency measurements, and formatted ASCII tables.
  * Built-in commands: `help`, `ping`, `usage`, `links list`, `links create`, `links get`, `links stats`, `links delete`, `keys list`, `auth`, `clear`.
* **Scoped API Key Management**:
  * Provision scoped API keys (`lnk_live_...`, `lnk_test_...`) with granular RBAC permissions (`links:read`, `links:write`, `links:delete`, `analytics:read`, `webhooks:read`, `webhooks:write`).
  * Stored using secure **one-way SHA-256 hashing** (raw secret shown only once at generation).
  * Roll / rotate secrets without changing key IDs.
* **Interactive API Playground**: Test GET, POST, PATCH, and DELETE endpoints with real API keys directly inside the dashboard.
* **Multi-Language Code Snippet Generator**: Copy-paste production code in **cURL**, **JavaScript (Fetch/Axios)**, **Python (Requests)**, **Go**, and **Node.js**.
* **OpenAPI 3.1.0 Specification**: Download official JSON OpenAPI specs compatible with Postman, Insomnia, and Swagger.
* **Live Request Audit Logs**: Inspect inbound API traffic with HTTP status codes, latency in milliseconds, and IP addresses.

---

### 3. 🪝 Enterprise Webhook System
* **Granular Event Subscriptions**: Subscribe to `link.clicked`, `link.created`, `link.updated`, `link.deleted`, and `link.limit_reached`.
* **Cryptographic Signatures (HMAC-SHA256)**: Every payload is signed with a secret key and sent via the `x-linkora-signature` header:
  ```http
  x-linkora-signature: t=1727025600,v1=5d41402abc4b2a76b9719d911017c592
  ```
* **Automated Exponential Backoff & Jitter**: Failed deliveries (4xx/5xx or timeout) automatically retry up to 5 times (`1m`, `5m`, `30m`, `2h`, `5h`).
* **Circuit Breaker**: Automatically pauses degraded endpoints after consecutive failures to protect downstream receivers.
* **Delivery Drawer & Manual Redelivery**: Inspect raw payload JSON, response status codes, latency, and trigger one-click manual redeliveries.

---

### 4. 📊 Real-Time Analytics & Telemetry
* **Stream Ingestion**: Redirects append to a Redis stream; a consumer enriches events and writes them to MongoDB (see [docs/architecture.md](docs/architecture.md)).
* **Multi-Dimensional Metrics**:
  * Total clicks and unique visitor counts.
  * Geolocation breakdown by country and city.
  * Device breakdown (Desktop, Mobile, Tablet).
  * Browser & Operating System distribution.
  * Referrer analysis and UTM campaign attribution.
* **Raw CSV Stream Export**: Download timestamped click logs for offline analysis in Excel, Tableau, or BigQuery.

---

### 5. ⚙️ Advanced Configuration & Preferences Hub
* **Profile & Custom Avatar Accent**: Customize your initials badge with 5 distinct color palettes (`Lime Accent`, `Indigo`, `Violet`, `Cyan`, `Rose`).
* **Link Creation Defaults**: Set standard category, expiration rules, and default UTM parameters that pre-fill the Create Link modal.
* **Security Center**:
  * Real bcrypt password change with an interactive password strength indicator.
  * Active Browser Session monitor with client OS and User-Agent tracking.
* **Analytics Privacy & GDPR Mode**: Option to mask the last octet of visitor IP addresses (`192.168.1.xxx`) before storing click records.
* **Data Management**:
  * **Export Account Archive (JSON)**: Complete backup of all shortened links, tags, and profile metadata.
  * **Cascading Account Deletion**: Securely cleans up all user links, webhooks, and API keys.

---

### 6. 🎨 Custom Dark-Mode UI & Modal System
* **Zero Browser `window.confirm()` Alerts**: All native browser dialogs replaced with a custom, accessible, animated confirmation modal system (`ConfirmModal`) built with **Framer Motion** and backdrop blur.
* **Tailored Aesthetics**: Modern dark hacker aesthetic (`#0A0A0B`, `#C6FF3D` lime accent) with fluid micro-interactions and toast notifications.

---

## 🛡️ Security Architecture

```
Inbound Request
      │
      ▼
┌──────────────────────────────────────────────┐
│  Distributed Token Bucket Rate Limiter       │  (30 req burst, 10/s refill)
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  SSRF Protection Validator                   │  (Blocks 127.0.0.1, AWS 169.254.169.254, RFC1918)
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  Authentication & Scopes RBAC                │  (SHA-256 API Key Hash / JWT Session)
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  Tenant-Scoped Parameterized Queries         │  (WHERE user = req.user.id)
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  MongoDB / Redis                             │
└──────────────────────────────────────────────┘
```

1. **Strict Multi-Tenant Isolation**: Every database query is strictly scoped to `req.user.id`. No user can query or modify another user's links.
2. **Server-Side Request Forgery (SSRF) Guard**: URL inputs are resolved and screened against loopback, private IPv4/IPv6 subnets, and AWS cloud metadata endpoints.
3. **One-Way Key Hashing**: API keys are hashed with `crypto.createHash('sha256')`. Raw secrets never touch the database.
4. **Token-Bucket Rate Limiting**: Distributed Redis token-bucket limiter protects endpoints against DDoS and scraping.

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend Framework** | React 18 + Vite | Blazing fast client-side SPA bundle |
| **Styling & Icons** | Tailwind CSS + Lucide Icons | Responsive modern dark theme & visual system |
| **Motion & Animation** | Framer Motion | Fluid modal transitions and micro-animations |
| **State Management** | Zustand | Lightweight, persistent client state stores |
| **Charts & Visuals** | Recharts | Interactive time-series and distribution graphs |
| **Backend Runtime** | Node.js (ESM) + Express.js | High-throughput REST API server |
| **Primary Database** | MongoDB + Mongoose | User records, links, webhooks, and API keys |
| **Cache & Throttling** | Redis (ioredis) | Sub-millisecond redirects and token-bucket rate limiter |
| **Analytics Engine** | MongoDB (behind an `AnalyticsRepository` interface) | Click storage and aggregation ([ADR 0005](docs/adr/0005-analytics-on-mongodb.md)) |
| **Validation & Security** | Helmet, bcryptjs, validator | Strict sanitization, hashing, and header protection |

---

## 📦 Getting Started

### Prerequisites
* **Node.js** (v18.0.0 or higher)
* **MongoDB** (running locally or MongoDB Atlas)
* **Redis** (running locally on port 6379 or cloud instance)

---

### 1. Clone the Repository
```bash
git clone https://github.com/PiyushY111/Linkora.git
cd Linkora
```

---

### 2. Configure Backend
```bash
cd backend
npm install
```

Create a `.env` file inside `backend/`:
```env
PORT=5001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
MONGODB_URI=mongodb://localhost:27017/url_shortener
REDIS_URL=redis://127.0.0.1:6379
# Optional in dev - falls back to REDIS_URL. See "Redis roles" below.
# REDIS_CACHE_URL=redis://127.0.0.1:6380
JWT_SECRET=super_secret_jwt_key_linkora_dev_32chars_min
JWT_REFRESH_SECRET=super_secret_refresh_key_linkora_dev_32chars
API_KEY_HEADER=x-api-key
```

#### Redis roles

Linkora talks to two logical Redis roles, which can be the same instance in
development (`REDIS_CACHE_URL` defaults to `REDIS_URL`) but should be
separate instances in production:

| Role | Env var | Holds | Eviction policy |
|---|---|---|---|
| Core | `REDIS_URL` | Refresh-token families, rate limiters, the click stream, per-link usage counters | **`noeviction`** — none of this is reconstructible on the spot; losing a key here is a correctness bug, not a cache miss |
| Cache | `REDIS_CACHE_URL` | `link:meta:{shortCode}` read-through cache only | `allkeys-lru` is safe — every value is trivially re-derived from MongoDB, so evicting a cold entry just costs one extra DB read |

The short-code sequence counter lives in MongoDB, not Redis (see
`src/models/Counter.js`), specifically because it must never repeat or go
backwards — a property an evictable cache can't guarantee.

Start the backend server:
```bash
npm run dev
# Server listening on http://localhost:5001
```

---

### 3. Configure Frontend
```bash
cd ../frontend
npm install
```

Start the frontend development server:
```bash
npm run dev
# Client running on http://localhost:3000
```

---

## 📚 Public API (v1) Reference

All Public API endpoints accept authentication via the `x-api-key` header:

```http
x-api-key: lnk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Endpoints Overview

| Method | Endpoint | Required Scope | Description |
|---|---|---|---|
| `GET` | `/api/public/v1/openapi.json` | *None (Public)* | Download official OpenAPI 3.1.0 specification |
| `GET` | `/api/public/v1/usage` | *Valid Key* | Key metadata, scopes, and token-bucket capacity |
| `GET` | `/api/public/v1/links` | `links:read` | List paginated short links with filters |
| `POST` | `/api/public/v1/links` | `links:write` | Shorten a new destination URL |
| `GET` | `/api/public/v1/links/:code` | `links:read` | Retrieve metadata for a specific short link |
| `PATCH` | `/api/public/v1/links/:code` | `links:write` | Update destination URL, title, or tags |
| `DELETE` | `/api/public/v1/links/:code` | `links:delete` | Permanently delete a short link |
| `GET` | `/api/public/v1/links/:code/analytics` | `analytics:read` | Retrieve click metrics and geo data |
| `POST` | `/api/public/v1/links/bulk` | `links:write` | Bulk provision up to 1,000 links |

---

### Example: Shorten a Link via cURL
```bash
curl -X POST http://localhost:5001/api/public/v1/links \
  -H "Content-Type: application/json" \
  -H "x-api-key: lnk_live_xxxxxxxxxxxxxxxx" \
  -d '{
    "originalUrl": "https://stripe.com/docs",
    "customAlias": "stripe-api-docs",
    "title": "Stripe Documentation",
    "tags": ["docs", "api"]
  }'
```

**Response (HTTP 201 Created)**:
```json
{
  "success": true,
  "link": {
    "id": "664fa1e2b...",
    "shortCode": "stripe-api-docs",
    "shortUrl": "http://localhost:3000/stripe-api-docs",
    "originalUrl": "https://stripe.com/docs",
    "title": "Stripe Documentation",
    "tags": ["docs", "api"],
    "clicks": 0,
    "qrCode": "data:image/png;base64,...",
    "isActive": true,
    "createdAt": "2026-09-22T16:00:00.000Z"
  }
}
```

---

## 🪝 Webhook Signature Verification

When receiving webhooks from Linkora, verify the payload authenticity using the signing secret:

```javascript
import crypto from 'crypto';

function verifyLinkoraSignature(rawBody, signatureHeader, secret) {
  // Extract timestamp and signature: t=1727025600,v1=5d41402...
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => p.split('='))
  );

  const timestamp = parts.t;
  const receivedSig = parts.v1;

  // Prevent replay attacks (tolerance: 5 minutes)
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - Number(timestamp)) > 300) {
    throw new Error('Webhook timestamp outside tolerance window');
  }

  // Compute expected HMAC-SHA256 signature
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(receivedSig),
    Buffer.from(expectedSig)
  );
}
```

---

## 👨‍💻 Author

**Piyush Yadav**
* GitHub: [@PiyushY111](https://github.com/PiyushY111)
* Repository: [PiyushY111/Linkora](https://github.com/PiyushY111/Linkora)
* Contact: `piyush.2024@nst.rishihood.edu.in`

---

## 📄 License

This project is licensed under the **MIT License** — feel free to use, modify, and distribute for personal or commercial projects.

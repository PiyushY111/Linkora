import dotenv from 'dotenv';
import { z } from 'zod';
import { parseAllowedOrigins } from '../lib/originPolicy.js';

dotenv.config();

/**
 * Strict environment schema. The app refuses to boot if a required variable
 * is missing or malformed. Optional integrations (GeoIP, Safe
 * Browsing/VirusTotal, SSO, webhooks) are validated
 * only when their corresponding *_ENABLED flag is true, so the app can still
 * boot in a minimal local/dev configuration.
 */
const booleanFromEnv = z
  .enum(['true', 'false'])
  .optional()
  .default('false')
  .transform((v) => v === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    FRONTEND_URL: z.string().url().default('http://localhost:3000'),
    // Extra browser origins allowed to make credentialed requests, besides
    // FRONTEND_URL: comma-separated bare origins, no wildcards
    // (lib/originPolicy.js).
    ALLOWED_ORIGINS: z
      .string()
      .optional()
      .default('')
      .transform((value, ctx) => {
        try {
          return parseAllowedOrigins(value);
        } catch (err) {
          ctx.addIssue({ code: 'custom', message: err.message });
          return z.NEVER;
        }
      }),
    COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).optional(),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
    // Number of reverse-proxy hops in front of this app (nginx, ALB, etc.).
    // Trusting all hops (`true`) lets a client spoof X-Forwarded-For and
    // bypass IP-based rate limiting — trust only as many hops as you
    // actually have.
    TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(1),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    // MongoDB
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    MONGODB_MAX_POOL_SIZE: z.coerce.number().int().positive().default(100),
    MONGODB_MIN_POOL_SIZE: z.coerce.number().int().nonnegative().default(20),
    MONGODB_MAX_IDLE_TIME_MS: z.coerce.number().int().positive().default(30000),
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

    // JWT
    JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
    JWT_EXPIRE: z.string().default('7d'),
    JWT_ACCESS_TOKEN_TTL: z.string().default('15m'),
    JWT_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
    // Falls back to JWT_SECRET when unset; separate so the Feistel cipher key
    // can be rotated independently of the auth signing secret.
    LINK_SEQUENCE_CIPHER_KEY: z.string().optional().default(''),

    // Cloudinary (optional - falls back to local base64 QR codes)
    CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
    CLOUDINARY_API_KEY: z.string().optional().default(''),
    CLOUDINARY_API_SECRET: z.string().optional().default(''),

    // Rate limiting (legacy local fallback + Redis-backed tiers)
    RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(15),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(1500),

    // Redis: one database for cache, streams, rate limits and tokens. Every
    // key has a TTL or a hard bound (docs/redis-keys.md), so run it with
    // maxmemory-policy noeviction.
    REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
    REDIS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
    REDIS_NEGATIVE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(120),

    // Redis Streams
    CLICK_STREAM_KEY: z.string().default('stream:clicks'),
    CLICK_STREAM_CONSUMER_GROUP: z.string().default('click-consumers'),
    CLICK_STREAM_BATCH_SIZE: z.coerce.number().int().positive().default(500),
    // separate: the click consumer runs as its own process
    // (src/consumers/clickConsumer.js). embedded: server.js also runs it
    WORKER_MODE: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.enum(['separate', 'embedded']).default('embedded')),

    // Consumer polling (Redis command budget, docs/redis-keys.md): the
    // blocking read starts at the min BLOCK and doubles while the stream is
    // idle, up to the max; stale pending entries are reclaimed on a timer.
    CLICK_CONSUMER_BLOCK_MIN_MS: z.coerce.number().int().positive().default(1000),
    CLICK_CONSUMER_BLOCK_MAX_MS: z.coerce.number().int().positive().default(30000),
    CLICK_CONSUMER_CLAIM_INTERVAL_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
    // Approximate caps (XADD MAXLEN ~). If the consumer falls further behind
    // than this, the oldest unprocessed clicks are trimmed and lost.
    CLICK_STREAM_MAXLEN: z.coerce.number().int().positive().default(10000),
    WEBHOOK_DLQ_STREAM_KEY: z.string().default('stream:webhooks:dlq'),
    WEBHOOK_DLQ_STREAM_MAXLEN: z.coerce.number().int().positive().default(1000),

    // Analytics: raw click events (time-series) and hourly rollups are
    // kept this long; daily rollups are kept indefinitely.
    CLICK_EVENT_RETENTION_DAYS: z.coerce.number().int().positive().default(90),

    // Metrics
    METRICS_TOKEN: z.string().optional().default(''),

    // GeoIP (MaxMind GeoLite2)
    GEOIP_DB_PATH: z.string().optional().default(''),
    GEOIP_ACCOUNT_ID: z.string().optional().default(''),
    GEOIP_LICENSE_KEY: z.string().optional().default(''),
    GEOIP_EDITION_ID: z.string().optional().default('GeoLite2-City'),

    // Threat detection
    SAFE_BROWSING_ENABLED: booleanFromEnv,
    SAFE_BROWSING_API_KEY: z.string().optional().default(''),
    VIRUSTOTAL_ENABLED: booleanFromEnv,
    VIRUSTOTAL_API_KEY: z.string().optional().default(''),

    // SSO
    SSO_ENABLED: booleanFromEnv,
    WORKOS_API_KEY: z.string().optional().default(''),
    WORKOS_CLIENT_ID: z.string().optional().default(''),
    WORKOS_REDIRECT_URI: z.string().optional().default(''),

    // Webhooks
    WEBHOOK_SIGNING_SECRET: z.string().optional().default(''),

    // Public API
    API_KEY_HEADER: z.string().default('x-api-key'),
  })
  .superRefine((env, ctx) => {
    // Rollup dedup keeps a window of the last 1,000 applied event IDs per
    // document; a batch larger than that could evict its own IDs.
    if (env.CLICK_STREAM_BATCH_SIZE > 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CLICK_STREAM_BATCH_SIZE'],
        message: 'CLICK_STREAM_BATCH_SIZE must be at most 1000 (the per-document applied-ID window)',
      });
    }
    if (env.SAFE_BROWSING_ENABLED && !env.SAFE_BROWSING_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SAFE_BROWSING_API_KEY'],
        message: 'SAFE_BROWSING_API_KEY is required when SAFE_BROWSING_ENABLED=true',
      });
    }
    if (env.VIRUSTOTAL_ENABLED && !env.VIRUSTOTAL_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['VIRUSTOTAL_API_KEY'],
        message: 'VIRUSTOTAL_API_KEY is required when VIRUSTOTAL_ENABLED=true',
      });
    }
    if (env.SSO_ENABLED && (!env.WORKOS_API_KEY || !env.WORKOS_CLIENT_ID)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WORKOS_API_KEY'],
        message: 'WORKOS_API_KEY and WORKOS_CLIENT_ID are required when SSO_ENABLED=true',
      });
    }
    if (env.NODE_ENV === 'production' && env.JWT_SECRET.includes('your_')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET looks like a placeholder value; set a real secret in production',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  // Config validation runs before the logger exists, so this is the one
  // legitimate console usage in the app.
  console.error(`Invalid environment configuration:\n${details}`);
  process.exit(1);
}

export const env = parsed.data;
export default env;

# Linkora – Engineering Rules

## Project
URL shortener: Express (ESM) + MongoDB (including analytics: time-series raw clicks + rollups) + one Redis database (cache, streams, rate limits), React/Vite frontend, all on free tiers. A click-consumer worker reads the Redis stream, as its own process or embedded in the API (`WORKER_MODE`).

## Goals
Production-grade security and architecture. Correctness over features. Every claim in the README must be true and verifiable in code.

## Rules
- Work in small, focused commits (conventional commits: fix:, feat:, refactor:, test:, chore:). One logical change per commit.
- Before changing a module, read it and every caller. After changing, grep for all usages to ensure nothing broke.
- Never swallow errors silently. Never return raw error.message to clients.
- No secrets in URLs, logs, or query strings.
- Redis is a cache: nothing whose loss causes data corruption may live only in an evictable Redis key.
- Every write path that is retried must be idempotent.
- Don't add new features. Don't add dependencies without stating why.
- If a change requires a product decision (remove vs complete a feature), STOP and ask me.
- Remove leftover tooling comments ("Phase N", "Feature N", "source spec", "coding-style rule") when touching a file.
- Naming: the product is "Linkora". Replace "Linkly" everywhere, including headers (Linkora-Signature etc.), keeping a backward-compatible legacy header only if documented.

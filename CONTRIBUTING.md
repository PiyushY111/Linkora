# Contributing

## Setup

Follow the quick start in the [README](README.md). You need Node.js 22+, and
MongoDB and Redis running locally.

## Running the checks

```bash
cd backend
MONGODB_URI=mongodb://127.0.0.1:27017/linkora npm test

cd ../frontend
npm run lint && npm test && npm run build
```

The backend tests write to a `<database>_test` database next to
`MONGODB_URI` and to Redis database 15. **Always point `MONGODB_URI` at a
local MongoDB when running tests.** `dotenv` does not override variables
that are already set, so exporting it on the command line wins over
`backend/.env`.

## Making a change

- **One logical change per commit**, with a
  [Conventional Commits](https://www.conventionalcommits.org/) message:
  `fix:`, `feat:`, `refactor:`, `test:`, `docs:`, `chore:`, `perf:`, `ci:`.
  Explain *why* in the body.
- **Every bug fix or security fix comes with a regression test** that fails
  without the fix.
- **Read a module and its callers before changing it**, and grep for every
  usage afterwards.
- **Don't add a dependency** without saying why in the commit message.
- **Never return a raw `error.message` to a client.** Throw one of the typed
  errors in `backend/src/lib/errors.js`; anything else becomes a generic 500.
- **Every Redis key needs a TTL or a cap.** The hygiene test fails otherwise;
  add new key families to [docs/redis-keys.md](docs/redis-keys.md).
- **Anything retried must be idempotent.**
- **Keep the docs true.** If a change affects a claim in the README or in
  `docs/`, update it in the same commit. When you fix something listed in
  [docs/KNOWN_BUGS.md](docs/KNOWN_BUGS.md), delete the entry; when you find
  a problem you are not fixing, add one.

## Pull requests

Describe what changed and why, how you tested it, and anything reviewers
should look at closely. CI must pass.

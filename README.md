# Sufra — starting template

A Bun-monorepo starting template on the Effect v4 + Cloudflare + Alchemy v2
backbone, modeled on the domain-x setup. One Alchemy stack deploys two
Workers: a private Effect-native backend owning the data plane (D1, R2,
email, Better Auth), and a public TanStack Start website as the sole ingress.

## What is in the box

- **One stack** (`alchemy.run.ts` + `website.ts` at the root): one plan, one
  state file, every stage (`dev_<user>`, `pr-N`, `test-*`, `prod`) is a
  complete isolated copy.
- **Backend app** (`apps/backend`, `workersDev: false`): Effect v4 HTTP API
  (contract + controller + aggregate layers), Better Auth passwordless email
  OTP, D1 with file migrations, a private R2 bucket, and Cloudflare email
  sending.
- **Web app** (`apps/web`): TanStack Start on `Cloudflare.Website.Vite`; the
  `/api/*` catch-all forwards to the backend over the `BACKEND` service
  binding, and the SSR session gate dispatches in-process (no self-fetch).
- **Shared contract**: `apps/backend/src/contracts` + `src/views` are the
  browser-safe HTTP interface. The web app imports them as
  `@sufra/backend/contract` and derives its typed client from them — no
  hand-written URLs, no response decoding.
- **Demo resource** ("notes"): rows in D1, optional attachments as private R2
  objects, every endpoint owner-scoped by the session user id. Sign in at
  `/login`, then use `/demo`.

## Authentication and the development mailbox

Sign-in is a 6-digit emailed code (Better Auth `emailOTP`, hashed at rest,
database-backed rate limits). The domain-x development mode carries over:

- On every non-prod stage (and any localhost request) the OTP is **captured
  into a `dev_mailbox` D1 table** instead of being emailed, and the login page
  **autofills** it (`VITE_DEV_MAILBOX_ENABLED` / `import.meta.env.DEV`).
- The mailbox is readable at `GET /api/dev/mailbox?email=...` only from
  allowed hosts (`*.workers.dev` on non-prod, localhost always); any other
  host gets the same 404 as a missing code.
- Production stages set `DEV_MAILBOX_ENABLED=false` and send the real email
  through the Cloudflare email binding using `AUTH_EMAIL_FROM` (must be on a
  verified domain of the same account).

## Local development

Prerequisites: Bun 1.3+, and either an Alchemy OAuth login (`alchemy login`)
or `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` in `.env`
(see `.env.example`).

```sh
bun install
cp .env.example .env
bun run dev        # alchemy dev: stage dev_<your user> by default
```

`bun run dev` boots both Workers locally with emulated D1/R2, applies D1
migrations and the Better Auth schema, and prints the local site URL. State
isolates by stage, so parallel developers do not collide. Stages are plain
Alchemy stages: pass `--stage` to override, and destroy explicitly:

```sh
alchemy dev --stage dev_alice            # a specific developer stage
alchemy destroy --stage dev_fawwaz --yes # remove a developer stage
```

## Deploying

```sh
alchemy deploy --stage prod      # production
alchemy deploy --stage pr-123    # an isolated throwaway stage (clean destroy)
alchemy destroy --stage pr-123
```

Every non-prod stage gets its own D1 database, R2 bucket, and captured
mailbox; only `prod` sends real email.

## Verification gate

```sh
bun run check    # lint + typecheck (iac, backend, web) + format + build
```

CI should run `bun run check`, then (optionally) deploy a `test-<run>`
stage, smoke it, and destroy it — the domain-x preview pipeline is the
reference for wiring that up.

## Layout

```
alchemy.run.ts        the stack: providers + state + yield the units
website.ts            the frontend deploy unit (rootDir apps/web)
apps/backend/         the private Worker (contracts, views, domain, controllers, db, migrations)
apps/backend/config/  template-stable wiring: stage switches, auth options, route table
apps/web/             the public site (routes, typed client, auth gate)
patches/              better-auth + kysely D1-introspection fixes (bun patchedDependencies)
```

## Renaming for a new product

The template is named "Sufra" end to end: the stack name in
`alchemy.run.ts`, the Better Auth `appName`/`id` and mailbox table copy in
`apps/backend/src/worker.ts`, `@sufra/*` package names, and the site copy.
Rename those, then `alchemy deploy --stage prod` against your own account
and set `AUTH_EMAIL_FROM` to a verified sender.

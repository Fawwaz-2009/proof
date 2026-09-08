# proof

From zero to AI-driven development in under two minutes. You don't review
diffs: every pull request ships with a proof, the real app running isolated
on your own host. Mark it up, merge, and it ships.

A Bun-monorepo starting template on the Effect v4 + Cloudflare + Alchemy v2
backbone. One Alchemy stack deploys two Workers: a private Effect-native
backend owning the data plane (D1, R2, email, Better Auth), and a public
TanStack Start website as the sole ingress.

## Start a new app

```sh
bunx create-proof my-app
```

One command, a finished day zero: it checks prerequisites, guides the one
Cloudflare credential that can mint others, copies the bundled template with
a FRESH git history (no template commits), renames every identity token,
assigns fresh rate-limit namespaces, creates the GitHub repo, runs the
ceremony (mints the least-privilege CI token, writes every repo secret), and
opens your first proof PR with the remaining-setup checklist. Flags in
`--help` let agents run the same flow non-interactively. Because the
template ships inside the package, the command works whatever this
repository's visibility is, and every CLI release carries a template
snapshot you can test before it becomes the default anyone scaffolds.

## The loop

| Beat      | What happens                                                                 |
| --------- | ---------------------------------------------------------------------------- |
| Issue     | You write what done means.                                                   |
| Isolation | An agent takes a worktree; stages and ports are hashed, no clashes.          |
| Proof     | The pull request deploys the running app to your host. Automatically.        |
| Markup    | You test it and comment. The diff is for the compiler; the proof is for you. |
| Ship      | Merge ships it. That is the whole pipeline.                                  |

Everything below documents the template itself; it applies to the
scaffolded app as-is. Concept questions (what is a proof, why hashed ports,
the view concept) are answered in [docs/faq.md](docs/faq.md).

## What is in the box

- **One stack** (`alchemy.run.ts` + `website.ts` at the root): one plan, one
  state file, every stage (`dev_<user>`, `pr-N`, `prod`) is a complete
  isolated copy.
- **Backend app** (`apps/backend`, `workersDev: false`): Effect v4 HTTP API
  (contract + controller + aggregate layers), Better Auth passwordless email
  OTP, D1 with file migrations, a private R2 bucket, and Cloudflare email
  sending.
- **Web app** (`apps/web`): TanStack Start on `Cloudflare.Website.Vite`; the
  `/api/*` catch-all forwards to the backend over the `BACKEND` service
  binding, and the SSR session gate dispatches in-process (no self-fetch).
- **Shared contract**: `apps/backend/src/contracts` + `src/views` are the
  browser-safe HTTP interface. The web app imports them as
  `@proof/backend/contract` and derives its typed client from them: no
  hand-written URLs, no response decoding.
- **Demo resource** ("notes"): rows in D1, optional attachments as private R2
  objects, every endpoint owner-scoped by the session user id. Sign in at
  `/login`, then use `/demo`.

## Authentication and email

Sign-in is a 6-digit emailed code (Better Auth `emailOTP`, hashed at rest,
database-backed rate limits). The transport branches on the stage:

- `local` (`alchemy dev`) and `preview` stages (any deploy not named `prod`)
  **capture** the code: it appears as `[email] captured (...)` in the
  runner or deploy logs. No email leaves the account.
- The `prod` stage **delivers** through the Cloudflare send_email binding,
  from `AUTH_EMAIL_FROM` (required to deploy; set it to an address on a
  domain with Email Sending or Routing enabled in your Cloudflare account).

Two Cloudflare constraints worth knowing: send_email delivers only to
verified destination addresses (Email Routing > Destination addresses in
the dashboard), so delivery to arbitrary end-users needs a provider
integration later; and failed deliveries are logged rather than thrown, so
a send failure never breaks the sign-in request.

Never point a live send at a fake or placeholder address (`test.local`,
`example.com`, invented inboxes): bounces permanently damage the sending
domain's reputation. When testing real delivery, use an inbox you control
and verify it first under Email Routing > Destination addresses.

## Addresses and stages

One module decides every public hostname: `apps/backend/config/domain.ts`
(the `APP_SLUG` and optional `ROOT_DOMAIN` env vars):

| stage         | website URL                                             |
| ------------- | ------------------------------------------------------- |
| `alchemy dev` | `http://localhost:<web port>` (deterministic per stage) |
| no domain set | `https://<worker>.<account>.workers.dev`                |
| `prod`        | `https://proof.<your root domain>`                      |
| anything else | `https://proof-<stage>.<your root domain>`              |

Day zero works without owning a domain: the platform host is the default,
and setting `ROOT_DOMAIN` upgrades every stage on the next deploy. Every
hostname, auth origin, and sender address re-derives; nothing in the
database stores an absolute URL. Hostnames attach to the Website Worker as
Cloudflare Custom Domains: DNS and the edge certificate are created with
the deploy and destroyed with the stage. The backend Worker is never public
(`workersDev: false`): the website is the sole ingress over the service
binding. Better Auth's allowed hosts are derived from the same hostname and
bound as `AUTH_ALLOWED_HOSTS`.

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
alchemy destroy --stage dev_alice --yes  # remove a developer stage
```

## Deploying

```sh
alchemy deploy --stage prod      # production
alchemy deploy --stage pr-123    # preview: an isolated proof
alchemy destroy --stage pr-123
```

Every stage is a complete isolated copy: own D1 database, R2 bucket, public
hostname, and capture-only email; only `prod` sends real email.

## Verification gate

```sh
bun run check    # lint + typecheck (iac, backend, web) + format + build
```

## Continuous deployment

Two GitHub Actions workflows ship with the template (`.github/workflows/`),
plus one merge blocker:

- **PR preview** — every pull request deploys a fully isolated `pr-<n>` stage
  (own Workers, D1, R2; email captured) and posts the preview URL on the PR.
  Closing the PR destroys the stage, and the destroy job refuses any
  non-`pr-*` stage.
- **Prod CD** — merges to `main` deploy production, migrations riding the
  deploy.
- **Prod readiness** — the merge blocker: until the repository is
  production-ready (domain, sender address, R2 credentials), this check is
  red on every PR with the full setup checklist in its output. Mark it as a
  required status check in branch protection and merging is impossible
  before setup is done. It is self-removing: once the secrets exist, it
  passes silently forever. Previews themselves work from minute one
  (platform URLs, captured email), so agents and humans can build before
  the domain lands.

One-time ceremony (your machine, never CI) — the scaffold command above runs
it for you; the header of `stacks/github.ts` carries the full permission
list and the gotchas for the manual path:

```sh
GITHUB_OWNER=<you> GITHUB_REPO=<repo> \
APP_NAME="My App" ROOT_DOMAIN=<domain> \
AUTH_EMAIL_FROM="My App <noreply@<domain>>" \
R2_ACCESS_KEY_ID=<id> R2_SECRET_ACCESS_KEY=<secret> \
GITHUB_TOKEN=$(gh auth token) \
bunx alchemy deploy stacks/github.ts --stage bootstrap --yes
```

That mints the least-privilege CI token and writes every secret the
workflows need (including `APP_NAME`, the display name your app renders).
Two platform walls shape the ceremony: the deploying token is always
dashboard-born (API-minted tokens cannot carry token-creation rights), and
it must itself include "Account API Tokens: Edit", the one group that lets
it mint the CI child token. Acceptance is the peace-sign ritual: open the
marker PR, see the preview carry it, merge, watch prod migrate, then sign
in with a real email.

## Working with agents

The scaffolded `AGENTS.md` encodes the loop: an issue ends in a pull
request, never in "I'm done"; the PR description is the proof brief (what
changed, what fought back, how to give feedback). Every issue gets its own
worktree so parallel agents never share a checkout:

```sh
bun scripts/wt.ts <name>      # worktree at ../<repo>-wt/<name>, stage dev-<name>
bun scripts/wt.ts --list
bun scripts/wt.ts --remove <name>
```

Dev ports are hashed from project and stage (`config/domain.ts`), so two
projects, two agents, one machine: no clashes.

## Layout

```
alchemy.run.ts        the stack: providers + state + yield the units
website.ts            the frontend deploy unit (rootDir apps/web)
apps/backend/         the private Worker (contracts, views, domain, controllers, db, migrations)
apps/backend/config/  the infra room: D1/R2/bucket declarations + tags, stage switches,
                      auth options, dev-port + domain derivation (route manifest: inline in worker.ts)
apps/web/             the public site (routes, typed client, auth gate)
docs/faq.md           the decisions ledger, question-shaped
packages/create-proof/  the scaffold CLI (template snapshot synced at pack time)
patches/              better-auth + kysely D1-introspection fixes (bun patchedDependencies)
scripts/wt.ts         the worktree helper
```

## Identity and renaming

The scaffold sets every identity token at creation. Renaming the product
later is configuration, not code: edit `APP_NAME` (what people read) and
`APP_SLUG` (the hostname prefix) in `.env`, and redeploy. One rule: never
rename the stack name in `alchemy.run.ts` after the first deploy. It is
alchemy's state scope; changing it orphans your database and bucket under
an empty scope. See `docs/faq.md`.

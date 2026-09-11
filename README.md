# proof

From zero to AI driven development, in under 4 mins. You don't review
diffs: every pull request ships with a proof, the real app running isolated
on your own host. Mark it up, merge, and it ships.

A Bun-monorepo starting template on the Effect v4 + Cloudflare + Alchemy v2
backbone. One Alchemy stack deploys two Workers: a private Effect-native
backend owning the data plane (D1, R2, email, Better Auth), and a public
TanStack Start website as the sole ingress.

## Get started

One action: copy the block below and paste it into your coding agent
(Claude Code, Codex, Cursor, anything that reads a prompt) in an empty
directory. The agent asks for a project name and visibility, creates the
repository from this template with the GitHub CLI, and drives the whole
setup: install, the one hand-made Cloudflare credential, renaming, repo
secrets, and your first pull request with a running preview.

You need three things: the `gh` CLI authenticated (`gh auth login`), a
package manager (bun or npm), and a Cloudflare account. The same prompt
lives at [proof.fawwaz.dev](https://proof.fawwaz.dev), rendered a bit
prettier.

```text
Set up the proof starter template as a new project:
https://github.com/Fawwaz-2009/proof

proof is an Effect + Cloudflare starter where every pull request deploys
its own isolated preview, and merging ships production. Work one step at
a time and explain as you go. Once inside the repository, AGENTS.md and
docs/faq.md are the rules; read them before making changes.

1. Ask for the project name and whether the GitHub repository should be
   public or private.
2. Create the repository from the template, clone it, and work from its
   root:
   gh repo create <name> --template Fawwaz-2009/proof --private --clone
   (swap --private for --public if asked).
3. Install dependencies: bun install, or npm install when bun is not
   installed.
4. Read AGENTS.md and docs/faq.md.
5. Cloudflare credential: the admin profile must hold a Cloudflare API
   token, not an OAuth login: the ceremony mints two Cloudflare API
   tokens, and OAuth logins are forbidden from minting tokens. Run bunx
   alchemy profile show --profile admin: if it shows a connected
   Cloudflare API token, continue. If not: STOP and tell me this one-time credential
   must be created by hand in the Cloudflare dashboard: My Profile ->
   API Tokens -> Create Token -> Custom Token, with these permission
   groups: Account Settings Read, Workers Scripts Write, Workers KV
   Storage Write, Workers R2 Storage Write, Workers Routes Write,
   Workers Tail Read, Workers Observability Write, D1 Write, Email
   Sending Write, Secrets Store Write, and Account API Tokens Write (a
   dashboard-born token is required: tokens created by tools like you
   cannot hold this one). Then run bunx alchemy profile edit --profile
   admin --reconfigure Cloudflare, choose the API token method, and
   paste the token when prompted. Wait until I confirm.
6. Ask for the root domain and the sender email for auth codes. Both are
   optional: previews work without them, but production sign-in cannot
   deliver email until a real sender on the domain replaces the
   placeholder. If neither exists yet, keep the placeholder and warn me
   before the merge.
7. Set the identity. It lives in exactly two places. First .env (create
   it from .env.example): APP_NAME is what people read, APP_SLUG is the
   hostname prefix. Second identity.ts at the repo root: STACK is the
   infrastructure scope; set it once ("Proof" -> the project name in
   PascalCase) and never after the first alchemy deploy (the ceremony in
   step 9 is the first one), because renaming it later orphans the
   database, bucket, and workers. Nothing else carries identity: package
   scopes are @app/*, display fallbacks are neutral, and rate-limit
   namespace ids derive from the slug. Verify: grep -rn "Proof"
   --include=*.ts apps stacks website.ts alchemy.run.ts returns nothing
   (identity.ts and this prompt aside).
8. Commit the identity on main locally, and leave main unpushed:
    pushing or merging to main ships production, and production waits
    for a real sender (steps 11 and 12). Production is exactly the
    stage named prod: only the deploy-prod workflow deploys it, and
    stage logic (email capture, hostnames) keys on the literal name,
    so never deploy another stage name to a real domain.
9. Run the setup: bun run update-stack-secrets, prefixed with
   GITHUB_OWNER, GITHUB_REPO (from git remote), APP_NAME, APP_SLUG,
   ROOT_DOMAIN (if any), and AUTH_EMAIL_FROM. It mints the
   least-privilege CI token, mints the R2 keys, and writes every repo
   secret. Verify with gh secret list. Safe to re-run whenever the
   values change; re-running rotates live credentials, so redeploy any
   deployed stage afterwards.
10. Start a worktree (bun run wt <name>) and make the first change: the
    /demo page heading (apps/web/src/routes/_authed/demo.tsx, currently
    One of everything), a new field on notes, or a request. Build it by
    the book, run bun run check, and open the pull request. It carries
    the identity commit and the change together: main has never been
    pushed, and this pull request is what turns the template into the
    app. Its description starts with a warning: merging ships
    production, and if the sender email is still the placeholder, the
    readiness check stays red on purpose and login codes cannot be
    delivered. Under it: the proof brief from AGENTS.md and the
    production checklist.
11. CI posts the preview URL on the pull request. Share it and wait for
    feedback. Fix, repeat. On previews and local dev, sign in with any
    address whose name is exactly six digits, like 123456@dev.example.com:
    the code is 123456, no email involved. Production addresses get a
    real emailed code and ignore the format.
12. To go live: add the root domain and a real sender if they were
    skipped (update .env, re-run the setup from step 9), and the
    readiness check turns green. With feedback handled and readiness
    green, merge: the first production deploy ships with the migrations
    and the real sender.
13. Share the production URL and have the user sign in with a real
    email. That sign-in is the acceptance test. From here, AGENTS.md is
    the operating manual.

Always: never commit secrets, never echo tokens back, confirm before
anything billable, and show real errors instead of papering over them.
```

## The loop

| Beat      | What happens                                                                 |
| --------- | ---------------------------------------------------------------------------- |
| Issue     | You write what done means.                                                   |
| Isolation | An agent takes a worktree; stages and ports are hashed, no clashes.          |
| Proof     | The pull request deploys the running app to your host. Automatically.        |
| Markup    | You test it and comment. The diff is for the compiler; the proof is for you. |
| Ship      | Merge ships it. That is the whole pipeline.                                  |

Everything below documents the template itself; it applies to your app
as-is. Concept questions (what is a proof, why hashed ports, the view
concept) are answered in [docs/faq.md](docs/faq.md).

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
  Forms run on React Hook Form with Effect Schema validation; shadcn/ui is
  wired (`npx shadcn add <component>` on day one) but ships no components.
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
  **capture**: nothing is delivered. Sign in with any address whose name is
  exactly six digits (`123456@dev.example.com`) and the code is `123456`.
  No email leaves the account.
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

`prod` is load-bearing, not a convention: email capture, hostnames, and
the dev OTP confinement all key on the literal stage name, and only the
deploy-prod workflow deploys it. Never deploy another stage name to a
real domain.

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

Prerequisites: Bun 1.3+, and an Alchemy profile backed by a Cloudflare
API token (`alchemy profile edit --profile admin --reconfigure
Cloudflare`; OAuth logins cannot mint the API tokens the stack creates)
or `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` in `.env` (see
`.env.example`).

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

- **PR preview**: every pull request deploys a fully isolated `pr-<n>` stage
  (own Workers, D1, R2; email captured) and posts the preview URL on the PR.
  Closing the PR destroys the stage, and the destroy job refuses any
  non-`pr-*` stage.
- **Prod CD**: merges to `main` deploy production, migrations riding the
  deploy.
- **Prod readiness**: the merge blocker. Until the repository is
  production-ready (domain, sender address, R2 credentials), this check is
  red on every PR with the full setup checklist in its output. Mark it as a
  required status check in branch protection and merging is impossible
  before setup is done. It is self-removing: once the secrets exist, it
  passes silently forever. Previews themselves work from minute one
  (platform URLs, captured email), so agents and humans can build before
  the domain lands.

One-time ceremony (your machine, never CI): the getting-started prompt runs
it for you; the header of `stacks/github.ts` carries the full permission
list and the gotchas for the manual path:

```sh
GITHUB_OWNER=<you> GITHUB_REPO=<repo> \
APP_NAME="My App" APP_SLUG=my-app ROOT_DOMAIN=<domain> \
AUTH_EMAIL_FROM="My App <noreply@<domain>>" \
bun run update-stack-secrets
```

That mints the least-privilege CI token, mints the R2 presign credentials
(nothing to paste: R2 S3 keys are API tokens, and the ceremony creates
them), and writes every secret the workflows need (including `APP_NAME`,
the display name your app renders). The script pins the admin profile:
the deploying token must be dashboard-born (API-minted tokens cannot carry
token-creation rights) and must itself include "Account API Tokens: Edit",
the one group that lets it mint the CI child token. Acceptance is the loop
itself: open the first PR, watch the preview carry it, merge, watch prod
migrate, then sign in with a real email. Re-running is safe whenever values
change, with one warning: it rotates the CI token and R2 keys, so redeploy
every deployed stage afterwards.

## Working with agents

The repo's `AGENTS.md` encodes the loop: an issue ends in a pull
request, never in "I'm done"; the PR description is the proof brief (what
changed, what fought back, how to give feedback). Every issue gets its own
worktree so parallel agents never share a checkout:

```sh
bun run wt <name>             # worktree at ../<repo>-wt/<name>, stage dev-<name>
bun run wt --list
bun run wt --remove <name>
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
patches/              better-auth + kysely D1-introspection fixes (bun patchedDependencies)
scripts/wt.ts         the worktree helper
```

## Identity and renaming

Identity lives in exactly two places. `identity.ts` at the repo root
holds `STACK`, the one literal that scopes the infrastructure: it names
the app stack and derives the ceremony stack and token names, and it is
set once, at clone time, before the first alchemy deploy and never
again. Everything else reads env: `APP_NAME` (what people read) and
`APP_SLUG` (the hostname prefix) in `.env`. Package scopes are `@app/*`
and stay generic forever. Renaming the product later is two edits and a
redeploy. See `docs/faq.md`.

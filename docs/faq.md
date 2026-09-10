# FAQ

The education surface, question-shaped because that is how beginners ask.
Task questions (rename, domain, add a feature) are answered where they
arise: `.env.example` comments, the repo's AGENTS.md, and comments at
the code in question. Concept questions live here.

Status: draft. Grows as decisions land.

## Identity

**How do I rename my product?**
Set `APP_NAME` (what people read) and `APP_SLUG` (the hostname prefix) in
`.env`, then redeploy. Every hostname re-derives; nothing in the database
holds an absolute URL.

**What is the difference between the slug, the domain, and the name?**
A hostname has two parts: who you are and where you live. All three live
in env, because that is where a product rename happens: `APP_SLUG` is who
you are (the hostname prefix), `ROOT_DOMAIN` is where you live (the zone),
and `APP_NAME` is what people read. Change them in `.env`, redeploy, and
every hostname re-derives; nothing in code or the database carries the
old identity.

**Why can't I rename the stack name in `alchemy.run.ts`?**
`Alchemy.Stack("Proof", ...)` is the infrastructure's memory: the
scope under which alchemy remembers every resource it made. Rename it and
the next deploy finds an empty scope and builds a new, empty database and
bucket beside the old ones. Users, sessions, rows: orphaned. Product
renames happen in `APP_SLUG` and `APP_NAME`, never here.

## The loop

**What is a proof?**
The running preview of one pull request: the real app, isolated, on your
own host. Every PR ships with one, automatically. You do not review
diffs; you check the proof, mark it up, and merge ships it.

**How do multiple agents work at the same time without colliding?**
Each issue gets its own git worktree (`scripts/wt.ts`), its own branch,
its own stage. Dev ports are hashed from project and stage
(`config/domain.ts`), so two projects, two agents, one machine: no
clashes, no port registry.

**Do I need a domain to start?**
No. Cloudflare gives every account `<name>.<account>.workers.dev`, free,
name yours to choose. Day zero runs there. A custom domain is an upgrade:
set `ROOT_DOMAIN`, redeploy, everything re-derives. The moment you want
real email sign-in is the moment you bring a domain: Cloudflare only
sends email from addresses on a zone you control.

## Trust

**What can the CI token do?**
Deploy previews, and nothing else. The ceremony (`bun run
update-stack-secrets`) mints it in-stack, least-privilege. You never paste
a global key into a repo secret.

**When does production deploy?**
On merge to main, never before. The readiness gate blocks the merge from
a half-configured repo: production arms only when every secret checks
green.

**Why is my first pull request red?**
The readiness check is the setup checklist wearing a CI hat. Until the
ceremony has run (domain, sender address, R2 credentials), it fails on
every PR by design, so a half-configured repo cannot reach production.
Previews still work from minute one: platform URLs, captured email. Once
the secrets exist, the check passes silently forever.

**Why does setup need a dashboard-born Cloudflare token?**
Two platform walls. A token created by an API or a tool cannot carry
token-creation rights, and the ceremony must mint the CI child token, so
the credential that runs it has to be born in the dashboard (My Profile >
API Tokens) and must itself include "Account API Tokens: Edit". The
getting-started prompt checks for it after the dependency install and, if
it is missing, stops and walks you through the dashboard; the token never
enters the chat.

**Is it safe to re-run the ceremony?**
Yes: it is idempotent, and it is the expected way to change the domain,
sender, or app identity. One warning: re-running rotates the CI token and
the R2 keys, and every already-deployed stage keeps serving with the old
(now deleted) credentials until it is redeployed, which silently breaks
image signing and the sender. Redeploy every deployed stage afterwards.

## Craft

**Why does the demo have a note with an image?**
One entity, one image, the full path: the row in D1, the file in a
private R2 bucket, the link signed for the one person allowed to see it.
It is an exhibit: the shape every feature here takes, small enough to
replace without guilt.

**What is the view concept?**
One place authorizes and applies business rules; a pure function then
projects the domain row into a wire shape that arrives usable. The
canonical case is the image: no exposed keys, no second endpoint, no
re-validation. It only easily works because Effect makes the pipeline
compose.

**Why is the template the repository itself?**
No scaffold CLI, no snapshot to keep in sync: the repository carries the
template flag, and `gh repo create --template` copies it with fresh
history. A release is just a commit to main; what worked on the site
yesterday is what a new app clones today.

**Why is there no component library pre-installed?**
A starter should not choose your UI library. The demo uses plain Tailwind
classes, and no components ship in the box. What does ship is the shadcn/ui
wiring (`components.json`, the `cn` util, theme variables), so the day you
want it: `npx shadcn add <component>` just works, and a theme you design at
ui.shadcn.com/create applies with `npx shadcn apply --preset <code>`. The
reverse also works: `npx shadcn preset resolve` prints the create-page URL
for the theme your project already carries.

**How should I build forms?**
React Hook Form is included. The demo note form (`-components/note-form.tsx`)
shows the pattern: a schema validates client-side through Effect Schema's
Standard Schema interface (the same library that types the wire contract),
react-hook-form drives the fields, and the create mutation lives inside
the component that owns the form. The delete button
(`-components/delete-note-button.tsx`) is the small case: its mutation and
its error display live beside its two lines of UI. Supporting UI lives in
the dash-prefixed `-components` folder next to the route, which TanStack
Router excludes from the route tree.

## The two phases

**Why does alchemy have two phases?**
Because resources and requests live in different worlds. Resources (the
D1 binding, the R2 bucket, the auth instance) exist at deploy time and at
cold start: that is the init phase, where `worker.ts` reads config,
builds every service once, and provides them into the router. Requests
arrive later, one at a time: that is the runtime phase, where each
request gets a context (who is calling, the request itself). A service
built in init closes over its resources; a request handler closes over
the built services. The type system enforces the split: init may not ask
for a request, and handlers may not reach for resources directly.

**Why does domain code yield services instead of importing them?**
The yield chain is the provisioning chain. When `domain/notes.ts`
declares `yield* AppDatabase`, it is not calling anything: it is
registering a requirement that flows up to the init phase, where the
database binding exists and the service gets built. Importing and
calling directly would bypass that chain, and the code would die at the
discharge edge (`HttpRouter.toHttpEffect`) with a type error listing
exactly what nobody provided. Three rules keep you safe: never import a
resource outside `config/`, never call a service without yielding it,
and when a requirement is missing at the discharge edge, add a
`Layer.provide` upstream rather than casting.

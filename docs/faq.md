# FAQ

The education surface, question-shaped because that is how beginners ask.
Task questions (rename, domain, add a feature) are answered where they
arise: `.env.example` comments, the scaffolded AGENTS.md, and comments at
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
Deploy previews, and nothing else. The scaffold mints it in-stack,
least-privilege. You never paste a global key into a repo secret.

**When does production deploy?**
On merge to main, never before. The readiness gate blocks the merge from
a half-configured repo: production arms only when every secret checks
green.

**What does the CLI do with my Cloudflare credentials?**
Tries existing credentials silently (flag, env, stored profiles), shows
one outcome line, and only if none can mint tokens walks you through the
dashboard for the two permissions that matter. Environment credentials
are never persisted.

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

**Why does the CLI ship the template inside itself?**
create-next-app model: every release carries a tested snapshot, so a
release can be rehearsed before it becomes anyone's default, and
scaffolding works regardless of the template repo's visibility.

**Why raw Tailwind and no component library?**
A starter should not choose your UI library. The demo uses plain Tailwind
classes; replace it with your product and bring whatever you like.

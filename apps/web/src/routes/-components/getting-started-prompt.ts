// The getting-started prompt: the whole onboarding in one copyable block.
// It replaces the scaffold CLI, so it must carry everything the CLI
// automated: clone, identity rename, a fresh git history, the one
// hand-made Cloudflare credential, the ceremony, and the first pull
// request with its proof. It deliberately orchestrates instead of
// restating: the deep knowledge stays in the files it points at
// (stacks/github.ts, AGENTS.md, docs/faq.md, README.md) so nothing can
// drift. The clone link is hardcoded: it is the template's own URL and
// never changes.
export const getStartedPrompt = `Set up the proof starter template: https://github.com/Fawwaz-2009/proof

proof is an Effect + Cloudflare starter where every pull request deploys
its own isolated preview, and merging ships production. Clone it, turn
it into a working project, and take it from zero to a first merged pull
request with production live. One step at a time, explaining as you go.
Once inside, read AGENTS.md and docs/faq.md: they are the rules.

SETUP
1. Check the machine: bun 1.3+, git, and the gh CLI logged in
   (gh auth status).
2. Clone https://github.com/Fawwaz-2009/proof.
3. Ask for the project name (it names the directory too) and whether
   the GitHub repository should be public or private. From the name,
   set every identity token the README's "Identity and renaming"
   section lists: the stack name in alchemy.run.ts (set once, never
   after a first deploy), the package scope, and APP_NAME / APP_SLUG
   in .env.
4. Fresh git history: the template's commits are not the project's.
   Squash everything into a single commit ("fresh start from the proof
   template").
5. Create the GitHub repository with gh repo create (source is the
   current directory, push main), then continue from there.
6. Cloudflare credential: check bunx alchemy profile show admin, or
   CLOUDFLARE_API_TOKEN already exported. If neither exists, walk
   through creating a dashboard API token with the permission groups
   listed in the header of stacks/github.ts, then run bunx alchemy
   login --profile admin.
7. Ask for the root domain and the sender email for auth codes. Both
   can wait, at a price to explain: previews work without them, but
   production sign-in cannot deliver email until a real sender on the
   domain exists. If neither exists yet, use the shipped placeholder
   and be loud about it at step 11.
8. Run the setup: bun run update-stack-secrets, prefixed with
   GITHUB_OWNER, GITHUB_REPO, APP_NAME, APP_SLUG, ROOT_DOMAIN (if any),
   and AUTH_EMAIL_FROM. It authenticates with the admin profile from
   step 4; without it the token mint fails with Unauthorized. Re-running
   it later rotates live credentials: if a stage is already deployed,
   redeploy it right after. It mints the least-privilege CI token, mints the
   R2 keys, and writes every repo secret. Verify with gh secret list.
   Safe to re-run whenever the values change.

FIRST PULL REQUEST
9. Start a worktree (bun run wt <name>) and pick a small first change:
   the demo greeting copy, a new field on notes, or a request. Build
   it by the book, run bun run check, and open the pull request. Its
   description starts with a warning: merging ships production, and
   if the sender email is still the placeholder, login codes cannot
   be delivered. Under it: the proof brief from AGENTS.md, and the
   production checklist with whatever is still missing.
10. CI posts the preview URL on the pull request. Share it and wait
    for feedback. Fix, repeat.
11. Before merging: if the sender is still the placeholder, walk
    through creating a real one on the domain and re-run the ceremony
    so the secrets update. Push until the readiness check is green.
    Only then merge: production deploys with the migrations.
12. Share the production URL and have the user sign in with a real
    email. That sign-in is the acceptance test. From here, AGENTS.md
    is the operating manual.

Always: never commit secrets, never echo tokens back, confirm before
anything billable, show real errors instead of papering over them.`;

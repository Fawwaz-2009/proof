// The getting-started prompt: the whole onboarding in one copyable block.
// It replaces the scaffold CLI, so it must carry everything the CLI
// automated: identity rename, a fresh git history, the one hand-made
// Cloudflare credential, the ceremony, and the first pull request with
// its proof. It deliberately orchestrates instead of restating: the deep
// knowledge stays in the files it points at (stacks/github.ts,
// AGENTS.md, docs/faq.md, README.md) so nothing can drift.
export const getStartedPrompt = `You are in a freshly cloned proof template: an Effect + Cloudflare starter
where every pull request deploys its own isolated preview, and merging
ships production. Your job: take me from zero to my first merged pull
request, with production actually working at the end. Work from the
repository root, one step at a time, explaining as you go. First read
AGENTS.md and docs/faq.md: they are the rules of this project.

SETUP
1. Ask me what my app is called. From the name, set every identity token
   the README's "Identity and renaming" section lists: the stack name in
   alchemy.run.ts (set once, never after a first deploy), the package
   scope, and APP_NAME / APP_SLUG in .env.
2. Give me a fresh git history: the template's commits are not mine.
   Squash everything into a single commit ("fresh start from the proof
   template") and force-push main.
3. Check my machine: bun 1.3+, git, and the gh CLI logged in
   (gh auth status).
4. Check for a Cloudflare admin credential: bunx alchemy profile show
   admin, or CLOUDFLARE_API_TOKEN already exported. If neither exists,
   walk me through creating a dashboard API token with the permission
   groups listed in the header of stacks/github.ts, then have me run
   bunx alchemy login --profile admin.
5. Ask me for my root domain and the sender email for auth codes. Both
   can wait, at a price I should understand: previews work without them,
   but production sign-in cannot deliver email until a real sender on my
   domain exists. If I have neither, use the placeholder the template
   ships and make step 9 loud about it.
6. Run the setup: bun run ceremony, prefixed with GITHUB_OWNER,
   GITHUB_REPO, APP_NAME, APP_SLUG, ROOT_DOMAIN (if any), and
   AUTH_EMAIL_FROM. It mints the least-privilege CI token, mints the R2
   keys, and writes every repo secret. Verify with gh secret list. It is
   safe to re-run any time the values change.

FIRST PULL REQUEST
7. Create a worktree (bun run wt <name>) and pick a small first change
   with me: the demo greeting copy, a new field on notes, or my own
   issue. Build it by the book, run bun run check, and open the pull
   request. Its description starts with a warning: merging ships
   production, and if the sender email is still the placeholder, login
   codes cannot be delivered. Under it: the proof brief from AGENTS.md,
   and the production checklist with whatever is still missing.
8. CI will post the preview URL on the PR. Give it to me and wait while
   I check the running app. Collect my notes, fix, repeat.
9. Before we merge: if the sender is still the placeholder, walk me
   through creating a real one on my domain, re-run the ceremony so the
   secrets update, and push until the readiness check is green. Only
   then merge: production deploys with the migrations.
10. Give me the production URL and have me sign in with a real email.
    That sign-in is the acceptance test. From here on, AGENTS.md is the
    operating manual.

Always: never commit secrets, never echo my tokens back to me, confirm
with me before anything billable, and show me real errors instead of
papering over them.`;

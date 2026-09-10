// The getting-started prompt: the whole onboarding in one copyable block.
// The user does exactly one thing: paste this into an agent in an empty
// directory. The agent creates the repository from the template with the
// GitHub CLI, installs, and drives the entire flow. It must leave the
// agent zero room to guess: every step says what to run and what proves
// it worked, the questions are batched up front, and the deep knowledge
// stays in the files it points at (AGENTS.md, docs/faq.md,
// stacks/github.ts) so nothing drifts.
export const getStartedPrompt = `Set up the proof starter template as a new project:
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
5. Cloudflare credential: run bunx alchemy login --profile admin. If it
   prints a stored admin credential, continue. If not: STOP and tell me
   this one-time credential must be created by hand in the Cloudflare
   dashboard: My Profile -> API Tokens -> Create Token -> Custom Token,
   with these permission groups: Account Settings Read, Workers Scripts
   Write, Workers KV Storage Write, Workers R2 Storage Write, Workers
   Routes Write, Workers Tail Read, Workers Observability Write, D1
   Write, Email Sending Write, Secrets Store Write, and Account API
   Tokens Write (a dashboard-born token is required: tokens created by
   tools like you cannot hold this one). Give me the command to run with
   my new token and wait until I confirm.
6. Ask for the root domain and the sender email for auth codes. Both are
   optional: previews work without them, but production sign-in cannot
   deliver email until a real sender on the domain replaces the
   placeholder. If neither exists yet, keep the placeholder and warn me
   before the merge.
7. Rename the identity tokens from the project name; the template ships
   as "Proof" and must become the project everywhere. The MOST important
   rename comes first: the stack name in alchemy.run.ts ("Proof" -> the
   project name in PascalCase). It scopes the ID of every resource
   alchemy creates, so it must be set BEFORE any alchemy command runs
   (the ceremony in step 8 is the first one); renaming it after a deploy
   orphans the database, bucket, and workers. Then the rest: the package
   names (@proof/backend, @proof/web, the root name), every source
   import of @proof/backend, the "@proof/Notes" service tag, and
   APP_NAME / APP_SLUG in .env (create .env from .env.example). Verify:
   names (@proof/backend, @proof/web, the root name), every source
   import of @proof/backend, the "@proof/Notes" service tag, and
   APP_NAME / APP_SLUG in .env (create .env from .env.example). Verify:
   grep -rn "@proof/" apps/ returns nothing.
8. Commit the rename on main.
9. Run the setup: bun run update-stack-secrets, prefixed with
   GITHUB_OWNER, GITHUB_REPO (from git remote), APP_NAME, APP_SLUG,
   ROOT_DOMAIN (if any), and AUTH_EMAIL_FROM. It mints the
   least-privilege CI token, mints the R2 keys, and writes every repo
   secret. Verify with gh secret list. Safe to re-run whenever the
   values change; re-running rotates live credentials, so redeploy any
   deployed stage afterwards.
10. Push main: the production deploy runs green because the secrets
    already exist.
11. Start a worktree (bun run wt <name>) and pick a small first change:
    the demo greeting copy, a new field on notes, or a request. Build it
    by the book, run bun run check, and open the pull request. Its
    description starts with a warning: merging ships production, and if
    the sender email is still the placeholder, login codes cannot be
    delivered. Under it: the proof brief from AGENTS.md and the
    production checklist.
12. CI posts the preview URL on the pull request. Share it and wait for
    feedback. Fix, repeat.
13. When the readiness check is green and feedback is handled, merge:
    production deploys with the migrations.
14. Share the production URL and have the user sign in with a real
    email. That sign-in is the acceptance test. From here, AGENTS.md is
    the operating manual.

Always: never commit secrets, never echo tokens back, confirm before
anything billable, and show real errors instead of papering over them.`;

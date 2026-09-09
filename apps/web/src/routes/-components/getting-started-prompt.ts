// The getting-started prompt: the whole onboarding in one copyable block.
// It replaces the scaffold CLI, so it must carry everything the CLI
// automated: identity rename, the one hand-made Cloudflare credential, the
// ceremony, and the first pull request with its proof. Keep every claim
// pointing at files that actually exist in the template (AGENTS.md,
// stacks/github.ts, docs/faq.md): the agent will read them.
export const getStartedPrompt = `This repo is proof, a starter template on Cloudflare + Effect.
Take me from zero to my first merged pull request, one step at a
time, explaining as you go.

First read AGENTS.md, README.md, and docs/faq.md: they are the
rules of this project. Then:

1. Ask me what my project is called. Set every identity token the
   README's "Identity and renaming" section lists: the stack name
   in alchemy.run.ts (set once, never after a first deploy), the
   package scope, and APP_NAME / APP_SLUG in .env.
2. Check my machine: bun 1.3+, git, and the gh CLI logged in.
3. Walk me through creating the one Cloudflare credential that
   must be made by hand: a dashboard API token with the permission
   groups listed in the header of stacks/github.ts. Then have me
   authenticate alchemy with it.
4. Run the one-time ceremony documented there: it mints the
   least-privilege CI token, mints the R2 keys, and writes every
   repo secret. If I have no domain yet, continue anyway: previews
   work on platform URLs and email is captured to logs.
5. Pick a small first issue with me, branch, build it by the book,
   run bun run check, and open a pull request.
6. CI will post the preview URL on the PR. Give it to me and wait
   while I check the running app. Collect my notes, fix, repeat.
7. When I am happy, merge. If the readiness check is red, show me
   its checklist and finish whatever I can do today.

Never commit secrets. Never invent files the repo does not have.
Show me real errors, never a papered-over success.`;

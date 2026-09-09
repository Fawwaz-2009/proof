#!/usr/bin/env bun
/**
 * CI preflight: fails the job when production credentials are missing, with
 * the setup checklist as output. Two callers, same contract:
 *
 * - deploy-prod.yml runs it before shipping to prod, so prod never
 *   half-deploys on missing credentials.
 * - prod-readiness.yml runs it on every pull request. It is the merge
 *   blocker: mark it as a required status check in branch protection and
 *   merging is impossible until setup is done. Self-removing: once the
 *   secrets exist, it passes silently forever.
 *
 * Values arrive as environment variables mapped from repository secrets by
 * the calling workflow.
 */
// ROOT_DOMAIN is deliberately NOT required: day zero ships on the platform
// host, and a custom domain is an upgrade (set the secret, redeploy). R2
// credentials are minted by the ceremony, not pasted by the user.
const REQUIRED = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "AUTH_EMAIL_FROM", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] as const;

const missing = REQUIRED.filter((name) => !process.env[name]);
for (const name of missing) {
  console.error(`::error::${name} is not set in repository secrets`);
}

if (missing.length > 0) {
  console.log(`
  Production is not set up yet. Clear the blockers above in one command once
  two inputs exist:

    1. A dashboard-born Cloudflare API token (API-minted tokens cannot carry
       token-creation rights). Custom token permissions: Workers Scripts /
       KV Storage / R2 Storage / Routes: Edit, D1: Edit, Workers Tail: Read,
       Workers Observability: Edit, Email Sending: Edit, Secrets Store: Edit,
       Account Settings: Read, Account API Tokens: Edit.
    2. A domain on the Cloudflare account, only if you want a custom host
       (the platform host works without one). Optional: a verified sender
       inbox under Email Routing, so prod sign-in codes really arrive.

  Then, from the repository root, wire everything in one command:

    GITHUB_OWNER=<you> GITHUB_REPO=<repo> \\
    APP_NAME="My App" APP_SLUG=my-app ROOT_DOMAIN=<domain> \\
    AUTH_EMAIL_FROM="My App <noreply@<domain>>" \\
    GITHUB_TOKEN=$(gh auth token) \\
    bunx alchemy deploy stacks/github.ts --stage bootstrap --yes

  That mints the least-privilege CI token, mints the R2 presign
  credentials, and writes every secret these checks need. Re-run this
  workflow and it goes green.
`);
  process.exit(1);
}

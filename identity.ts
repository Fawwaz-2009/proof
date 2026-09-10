// The one identity literal. This string is alchemy's state scope: it
// names the app stack and, derived from it, the ceremony stack and the
// account-global token names in stacks/github.ts. Set it once, at clone
// time, before the first alchemy deploy; renaming it later orphans the
// existing D1, R2, and workers under an empty scope while the next
// deploy provisions fresh ones beside them. Everything else reads its
// identity from env (APP_NAME, APP_SLUG) or is generic; this is the
// only literal. See docs/faq.md.
export const STACK = "Proof";

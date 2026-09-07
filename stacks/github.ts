// The admin trust-root stack — run LOCALLY ONLY, never in CI.
//
// It mints the least-privilege CI token and writes every secret the workflows
// need into the GitHub repository. It WIRES, never MINTS the deploying
// credential: API-minted tokens refuse token-creation rights, so the one
// dashboard-born token (created by hand, permissions listed below) is the
// platform's irreducible human step.
//
// One-time ceremony (from the repository root, on a clean main):
//   1. Create the dashboard-born token — My Profile → API Tokens → Create
//      Custom Token, with the permission groups listed in `permissionGroups`
//      below (they match alchemy's PermissionGroups.ts exactly).
//   2. Authenticate alchemy with it: CLOUDFLARE_API_TOKEN=<token> (or
//      `alchemy login` via the API-token method).
//   3. Run:
//
//      GITHUB_OWNER=<you> GITHUB_REPO=<repo> \
//      ROOT_DOMAIN=<domain> AUTH_EMAIL_FROM="Starting Flare <noreply@<domain>>" \
//      R2_ACCESS_KEY_ID=<id> R2_SECRET_ACCESS_KEY=<secret> \
//      GITHUB_TOKEN=$(gh auth token) \
//      bunx alchemy deploy stacks/github.ts --stage bootstrap --yes
//
// Gotchas, both hard-won in the reference implementation: run it FROM the
// branch whose stack file you mean to deploy (a stale working tree silently
// no-ops), and never from CI — this stack holds the trust root.

import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

export default Alchemy.Stack(
  "StartingFlareGitHub",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const owner = yield* Config.string("GITHUB_OWNER").pipe(Effect.orDie);
    const repository = yield* Config.string("GITHUB_REPO").pipe(Effect.orDie);
    const repo = { owner, repository };
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;

    // Least-privilege CI token: exactly what deploying this stack needs, and
    // deliberately NO token-creation rights — API-minted tokens refuse them
    // anyway, and CI never mints credentials.
    const ciToken = yield* Cloudflare.ApiToken.AccountApiToken("StartingFlareCIToken", {
      policies: [
        {
          effect: "allow",
          permissionGroups: [
            "Workers Scripts Write",
            "Workers KV Storage Write",
            "Workers R2 Storage Write",
            "Workers Routes Write",
            "Workers Tail Read",
            "Workers Observability Write",
            "D1 Write",
            "Email Sending Write",
            "Secrets Store Write",
            "Account Settings Read",
          ],
          resources: { [`com.cloudflare.api.account.${accountId}`]: "*" },
        },
      ],
    });

    yield* GitHub.Secret("cf-api-token", {
      ...repo,
      name: "CLOUDFLARE_API_TOKEN",
      value: ciToken.value,
    });
    yield* GitHub.Secret("cf-account-id", {
      ...repo,
      name: "CLOUDFLARE_ACCOUNT_ID",
      value: Redacted.make(accountId),
    });

    // App-level values the workflows re-resolve on every deploy. The R2
    // account id is not among them: it is derived from the authenticated
    // account at synthesis (worker.ts reads CloudflareEnvironment). R2
    // credentials are the static pattern (one Object Read token, shared by
    // stages); upgrading to per-stage minting also removes these.
    const rootDomain = yield* Config.string("ROOT_DOMAIN").pipe(Effect.orDie);
    const authEmailFrom = yield* Config.string("AUTH_EMAIL_FROM").pipe(Effect.orDie);
    const r2AccessKeyId = yield* Config.string("R2_ACCESS_KEY_ID").pipe(Effect.orDie);
    const r2SecretAccessKey = yield* Config.string("R2_SECRET_ACCESS_KEY").pipe(Effect.orDie);

    yield* GitHub.Secret("root-domain", {
      ...repo,
      name: "ROOT_DOMAIN",
      value: Redacted.make(rootDomain),
    });
    yield* GitHub.Secret("auth-email-from", {
      ...repo,
      name: "AUTH_EMAIL_FROM",
      value: Redacted.make(authEmailFrom),
    });
    yield* GitHub.Secret("r2-access-key-id", {
      ...repo,
      name: "R2_ACCESS_KEY_ID",
      value: Redacted.make(r2AccessKeyId),
    });
    yield* GitHub.Secret("r2-secret-access-key", {
      ...repo,
      name: "R2_SECRET_ACCESS_KEY",
      value: Redacted.make(r2SecretAccessKey),
    });

    return { tokenName: "CLOUDFLARE_API_TOKEN", repository: `${owner}/${repository}` };
  }).pipe(Effect.orDie),
);

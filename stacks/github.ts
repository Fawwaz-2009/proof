// The admin trust-root stack: run LOCALLY ONLY, never in CI.
//
// It mints the least-privilege CI token, mints the R2 presign credentials
// (Cloudflare R2 S3 credentials ARE API tokens: access key id = token id,
// secret = the SHA-256 of the token value), and writes every secret the
// workflows need into the GitHub repository. It WIRES, never MINTS the
// deploying credential: API-minted tokens refuse token-creation rights, so
// the one dashboard-born token (created by hand, permissions listed below)
// is the platform's irreducible human step.
//
// One-time ceremony (from the repository root, on a clean main):
//   1. Create the dashboard-born token (My Profile -> API Tokens -> Create
//      Custom Token) with the `permissionGroups` list below PLUS
//      "Account API Tokens: Edit" (the caller needs it to mint the child
//      tokens at all; OAuth and API-minted tokens can never carry it).
//   2. Authenticate alchemy with it: `bunx alchemy profile edit
//      --profile admin --reconfigure Cloudflare` (choose the API token
//      method; the script below pins that profile).
//   3. Run the ceremony script, which wraps the raw deploy with the
//      GitHub token and the admin profile:
//
//      GITHUB_OWNER=<you> GITHUB_REPO=<repo> \
//      APP_NAME="My App" APP_SLUG=my-app ROOT_DOMAIN=<domain> \
//      AUTH_EMAIL_FROM="My App <noreply@<domain>>" \
//      bun run update-stack-secrets
//
// Gotchas, both hard-won in the reference implementation: run it FROM the
// branch whose stack file you mean to deploy (a stale working tree silently
// no-ops), and never from CI: this stack holds the trust root.

// The stack scope and the account-global token names below derive from
// STACK in identity.ts: one literal, set once at clone time, before the
// first alchemy deploy. A product rename edits the env and must never
// move this stack's state scope, or the next ceremony would provision
// duplicate tokens beside the live ones. Deriving from the shared
// literal keeps two apps bootstrapped on one Cloudflare account from
// fighting over singleton token names.

import { createHash } from "node:crypto";
import { STACK } from "../identity.ts";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as GitHub from "alchemy/GitHub";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

export default Alchemy.Stack(
  `${STACK}GitHub`,
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const owner = yield* Config.string("GITHUB_OWNER").pipe(Effect.orDie);
    const repository = yield* Config.string("GITHUB_REPO").pipe(Effect.orDie);
    const repo = { owner, repository };
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;

    // The CI token is minted HERE, by this stack, from the caller's
    // credential: the mint requires the caller to carry "Account API Tokens:
    // Edit", which OAuth sessions and API-minted tokens can never hold,
    // so this ceremony must run with the dashboard-born admin credential
    // (--profile admin, API-token method).
    const ciToken = yield* Cloudflare.ApiToken.AccountApiToken(`${STACK}CIToken`, {
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
    // account at synthesis (worker.ts reads CloudflareEnvironment).
    const appName = yield* Config.string("APP_NAME").pipe(Config.withDefault("App"), Effect.orDie);
    const appSlug = yield* Config.string("APP_SLUG").pipe(Config.withDefault("app"), Effect.orDie);
    // Day zero may ship on the platform host: an empty ROOT_DOMAIN is
    // legal (the deploy-time domain config treats empty as absent), and
    // the secret is written anyway so the workflows always resolve it.
    const rootDomain = yield* Config.string("ROOT_DOMAIN").pipe(Config.withDefault(""), Effect.orDie);
    const authEmailFrom = yield* Config.string("AUTH_EMAIL_FROM").pipe(Effect.orDie);

    // The display name rides the deploys so renamed apps greet their
    // owner's product, not the template's.
    yield* GitHub.Secret("app-name", {
      ...repo,
      name: "APP_NAME",
      value: Redacted.make(appName),
    });
    yield* GitHub.Secret("app-slug", {
      ...repo,
      name: "APP_SLUG",
      value: Redacted.make(appSlug),
    });
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

    // The R2 presign credentials are minted HERE, not pasted by the user:
    // R2 S3 credentials are Account API tokens. Per Cloudflare's spec, the
    // access key id is the token's id and the secret access key is the
    // SHA-256 hex digest of its value.
    //
    // Scope trade-off, verified against the API: account-owned tokens
    // reject wildcard bucket resources ("must specify a bucket"), and the
    // ceremony cannot know future pr-N bucket names. So the token carries
    // the account-level storage groups: object read, write, and list on
    // every bucket, plus bucket administration. Narrower than the CI
    // token, broader than one bucket; per-stage minting at deploy time is
    // the refinement path if that ever matters.
    const toR2SecretAccessKey = (value: Redacted.Redacted<string>): Redacted.Redacted<string> =>
      Redacted.make(createHash("sha256").update(Redacted.value(value)).digest("hex"));
    const r2Token = yield* Cloudflare.ApiToken.AccountApiToken(`${STACK}R2Presign`, {
      policies: [
        {
          effect: "allow",
          permissionGroups: ["Workers R2 Storage Read", "Workers R2 Storage Write"],
          resources: { [`com.cloudflare.api.account.${accountId}`]: "*" },
        },
      ],
    });
    yield* GitHub.Secret("r2-access-key-id", {
      ...repo,
      name: "R2_ACCESS_KEY_ID",
      value: Output.map(r2Token.tokenId, (id) => Redacted.make(id)),
    });
    yield* GitHub.Secret("r2-secret-access-key", {
      ...repo,
      name: "R2_SECRET_ACCESS_KEY",
      value: Output.map(r2Token.value, toR2SecretAccessKey),
    });

    return { tokenName: "CLOUDFLARE_API_TOKEN", repository: `${owner}/${repository}` };
  }).pipe(Effect.orDie),
);

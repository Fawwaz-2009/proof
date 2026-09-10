import { Stack } from "alchemy/Stack";
import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

/**
 * The stage's public hostname, or null when no custom domain is configured.
 *
 * The slug is deployment identity in machine form and lives in env next to
 * everything else a product renames: `APP_SLUG` prefixes every hostname,
 * `ROOT_DOMAIN` is the zone it hangs from, `APP_NAME` is what people read.
 * Rename the product by editing those and redeploying; nothing in code.
 *
 * Day zero runs on the platform host (`<worker>.<account>.workers.dev`):
 * no domain ownership required. Setting `ROOT_DOMAIN` upgrades every
 * stage to `<slug>.<root domain>` (prod) and `<slug>-<stage>.<root
 * domain>` (everyone else), attached as Cloudflare Custom Domains: DNS
 * and the edge certificate are created with the deploy and destroyed
 * with the stage. The root zone must already exist on the deploy account
 * before setting it. Never consumed under `alchemy dev`, so a missing
 * synthesis context is a defect, not a fallback: a fabricated stage
 * would attach the wrong DNS name.
 */
export const websiteDomain = Effect.gen(function* () {
  const appSlug = yield* Config.string("APP_SLUG").pipe(Config.withDefault("app"), Effect.orDie);
  const baseDomain = yield* Config.option(Config.string("ROOT_DOMAIN")).pipe(Effect.orDie);
  const stack = yield* Effect.serviceOption(Stack);
  if (stack._tag === "None") {
    return yield* Effect.die("websiteDomain: no synthesis context (Stack service missing)");
  }
  const stage = stack.value.stage;
  if (baseDomain._tag === "None") return null;
  return stage === "prod" ? `${appSlug}.${baseDomain.value}` : `${appSlug}-${stage}.${baseDomain.value}`;
});

/**
 * Deterministic per-stage dev port: parallel `alchemy dev` sessions isolate
 * by STAGE, never by drifting ports. Deployed stages never read this. The
 * salt namespaces ports within one stage (the website is not the backend).
 *
 * The stage is the synthesis context, present only in the CLI process; it
 * is read here so no other module can consume an ambient value that is
 * always empty at runtime.
 */
export const devPort = (salt = "") =>
  Effect.gen(function* () {
    const stage = yield* Effect.serviceOption(Alchemy.Stage).pipe(Effect.map((service) => (service._tag === "Some" ? service.value : "")));
    const name = `${salt}${stage}`;
    let hash = 2166136261;
    for (let index = 0; index < name.length; index++) {
      hash ^= name.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return 20000 + ((hash >>> 0) % 20000);
  });

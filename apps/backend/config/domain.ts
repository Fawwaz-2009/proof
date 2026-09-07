import { Stack } from "alchemy/Stack";
import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

/** The app's identity: every public hostname and sender address derives from it. */
const APP_SLUG = "starting-flare";

/**
 * The stage's addresses.
 *
 * `websiteDomain`: the public hostname. The prod stage serves at
 * `<slug>.<root domain>`; every other stage serves at
 * `<slug>-<stage>.<root domain>`. The hostname attaches to the Website
 * Worker as a Cloudflare Custom Domain: DNS and the edge certificate are
 * created with the deploy and destroyed with the stage. Never consumed
 * under `alchemy dev`, so a missing synthesis context is a defect, not a
 * fallback: a fabricated stage would attach the wrong DNS name.
 */
export const websiteDomain = Effect.gen(function* () {
  // The root zone must already exist on the deploy account (Cloudflare
  // attaches the Custom Domain to it). Set ROOT_DOMAIN in .env before
  // deploying; the neutral default keeps the template publishable.
  const baseDomain = yield* Config.string("ROOT_DOMAIN").pipe(
    Config.withDefault("example.com"),
    Effect.orDie,
  );
  const stack = yield* Effect.serviceOption(Stack);
  if (stack._tag === "None") {
    return yield* Effect.die("websiteDomain: no synthesis context (Stack service missing)");
  }
  const stage = stack.value.stage;
  return stage === "prod" ? `${APP_SLUG}.${baseDomain}` : `${APP_SLUG}-${stage}.${baseDomain}`;
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
    const stage = yield* Effect.serviceOption(Alchemy.Stage).pipe(
      Effect.map((service) => (service._tag === "Some" ? service.value : "")),
    );
    const name = `${salt}${stage}`;
    let hash = 2166136261;
    for (let index = 0; index < name.length; index++) {
      hash ^= name.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return 20000 + ((hash >>> 0) % 20000);
  });

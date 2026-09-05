/**
 * Temp validation Worker — REBUILD LADDER.
 *
 * One piece at a time, typechecking + running between each, to find exactly
 * where the seam breaks.
 *
 * Ladder:
 *   ✓ database (config/database.ts): drizzle handle as the `Database` service
 *     (`DatabaseLive`); plan-time resources are module-level values, never
 *     yielded per request.
 *   ✓ environment primitive (config/environment.ts)
 *   ✓ email service (config/email.ts) as the `EmailSender` service
 *     (`EmailSenderLive`, send binding discharged at the layer)
 *   ✓ sign-in codes (contract group + domain + controller): handlers yield the
 *      `Database` / `EmailSender` tags, so requirements stay in the types.
 *   ✓ auth (config/auth.ts) — built at worker init with `CloudflareD1(TempDb)`
 *      and `EmailSenderLive` provided at the provide site.
 *
 * The wiring rule this ladder validated: requirements are discharged INTO the
 * router (before `HttpRouter.toHttpEffect`), never on the outer effect. The
 * `fetch` that reaches alchemy may only require what alchemy provides per
 * request (HttpServerRequest | Scope | RuntimeContext | PlatformServices |
 * WorkerServices); everything else is either provided here or it is a type
 * error at the class boundary.
 */
import * as Cloudflare from "alchemy/Cloudflare";
import { ALCHEMY_DEV } from "alchemy/Phase";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Etag, HttpRouter } from "effect/unstable/http";
import * as HttpPlatform from "effect/unstable/http/HttpPlatform";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { CloudflareD1 } from "@alchemy.run/better-auth/CloudflareD1";
import { auth } from "../config/auth.ts";
import { DatabaseLive, TempDb } from "../config/database.ts";
import { EmailSenderLive } from "../config/email.ts";
import { TempApi } from "../contract/temp.ts";
import { signInCodeHandlers } from "../controllers/sign-in-code.ts";
import { tempHandlers } from "../controllers/temp.ts";

export default class Temp extends Cloudflare.Worker<Temp>()(
  "Temp",
  Effect.gen(function* () {
    const isDev = yield* Effect.orDie(ALCHEMY_DEV);
    return {
      main: import.meta.filename,
      compatibility: { date: "2026-07-11", flags: ["nodejs_compat"] },
      ...(isDev ? { dev: { port: 23456, strictPort: true } } : {}),
    };
  }),
  Effect.gen(function* () {
    // Init-time construction. better-auth gets its D1 adapter (`CloudflareD1`
    // requires Worker/WorkerEnvironment, provided by alchemy here) and the
    // email sender is built once, not per request.
    const authInstance = yield* Effect.provide(auth, Layer.mergeAll(CloudflareD1(TempDb), EmailSenderLive));

    const SignInCodeHandlersLive = signInCodeHandlers;
    const TempHandlersLive = tempHandlers;

    const ApiRoutesLive = HttpApiBuilder.layer(TempApi);
    const AuthRoutesLive = HttpRouter.addAll([HttpRouter.route("*", "/api/auth/*", authInstance.fetch)]);
    const RoutesDomainRequirements = Layer.mergeAll(TempHandlersLive, SignInCodeHandlersLive);
    const platform = Layer.mergeAll(HttpPlatform.layer, Etag.layer);

    // The discharge edge: everything the routes need is provided HERE, before
    // toHttpEffect, so the resulting fetch carries no requirements that
    // alchemy cannot satisfy per request.
    const app = yield* HttpRouter.toHttpEffect(
      Layer.mergeAll(ApiRoutesLive, AuthRoutesLive).pipe(
        Layer.provideMerge(RoutesDomainRequirements),
        Layer.provideMerge(platform),
        Layer.provideMerge(DatabaseLive),
        Layer.provideMerge(EmailSenderLive),
      ),
    );

    return {
      fetch: app,
    };
  }),
) {}

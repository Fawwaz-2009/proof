/**
 * Temp validation Worker — REBUILD LADDER.
 *
 * One piece at a time, typechecking + running between each, to find exactly
 * where the seam breaks.
 *
 * Ladder:
 *   ✓ database (config/database.ts): drizzle schema resource + D1, consumed
 *     as `const database = yield* Database` and handed to auth.
 *   ⏳ next: the drizzle handle (Drizzle.D1 over the database) so domain code
 *      can persist — parked: contract/sign-in-codes group, controllers/ and
 *      domain/ sign-in-code files.
 *   ✓ environment primitive (config/environment.ts)
 *   ✓ email service (config/email.ts) + SendBinding provide
 *   ⏳ auth (config/auth.ts) — mounted, persistence parked
 */
import * as Cloudflare from "alchemy/Cloudflare";
import { ALCHEMY_DEV } from "alchemy/Phase";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Etag, HttpRouter } from "effect/unstable/http";
import * as HttpPlatform from "effect/unstable/http/HttpPlatform";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { auth } from "../config/auth.ts";
import { d1Database } from "../config/database.ts";
import { TempApi } from "../contract/temp.ts";
import { tempHandlers } from "../controllers/temp.ts";
import { CloudflareD1 } from "@alchemy.run/better-auth/CloudflareD1";

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
    const authInstance = yield* auth;

    const TempHandlersLive = yield* tempHandlers;

    const ApiRoutesLive = HttpApiBuilder.layer(TempApi);
    const AuthRoutesLive = HttpRouter.addAll([HttpRouter.route("*", "/api/auth/*", authInstance.fetch)]);

    return {
      fetch: yield* HttpRouter.toHttpEffect(
        Layer.mergeAll(ApiRoutesLive, AuthRoutesLive).pipe(Layer.provide(TempHandlersLive), Layer.provide(HttpPlatform.layer), Layer.provide(Etag.layer)),
      ),
    };
  }).pipe(Effect.provide(Cloudflare.Email.SendBinding), Effect.provide(Cloudflare.D1.QueryDatabaseBinding), Effect.provide(CloudflareD1(d1Database))),
) {}

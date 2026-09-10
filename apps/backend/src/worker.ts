import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { ALCHEMY_DEV } from "alchemy/Phase";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { Etag, HttpRouter } from "effect/unstable/http";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpPlatform from "effect/unstable/http/HttpPlatform";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Auth } from "../config/auth.ts";
import { AppDatabase } from "../config/database/index.ts";
import { MemoryFsLive } from "../config/memory-fs.ts";
import { DevRoutesLive } from "../config/dev-files.ts";
import { devPort, websiteDomain } from "../config/domain.ts";
import * as Config from "effect/Config";
import { Redacted } from "effect";
import { clientIp, RateLimits } from "../config/rate-limit.ts";
import { AppApi } from "./contracts/index.ts";
import { ApiHandlers } from "./controllers/index.ts";
import { NotesLive } from "./domain/notes.ts";
import { AuthenticatedLive } from "./middlewares/authentication.ts";
import { SchemaErrorHandlerLive } from "./middlewares/schema-error.ts";
import { Files, FilesBucket } from "../config/storage.ts";

/**
 * The Worker entry — the Init gen constructs each service once and builds the
 * services the routes close over; the discharge edge provides every remaining
 * requirement INTO the router, before `toHttpEffect`, so the fetch that
 * reaches alchemy requires only what alchemy serves per request.
 */

/** Platform services the HttpApi builder needs. Multipart files persist into the in-memory filesystem. */
const HttpServicesLive = Layer.mergeAll(Path.layer, Etag.layerWeak, HttpPlatform.layer).pipe(Layer.provideMerge(MemoryFsLive));

export default class Backend extends Cloudflare.Worker<Backend>()(
  "Backend",
  // The props read the ambient stage at synthesis; the deployed Worker
  // re-evaluates them without infrastructure context, where the
  // production-shaped fallback keeps the object total and unused.
  Effect.gen(function* () {
    const port = yield* devPort();
    const isDev = yield* Effect.orDie(ALCHEMY_DEV);
    const filesBucket = yield* FilesBucket;
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;
    const websiteUrl = yield* websiteDomain;
    return {
      main: import.meta.filename,
      workersDev: false,
      compatibility: {
        date: "2026-07-11",
        flags: ["nodejs_compat", "enable_request_signal"],
      },
      observability: {
        enabled: true,
        headSamplingRate: 0.1,
        logs: { enabled: true, invocationLogs: true, headSamplingRate: 0.1 },
        traces: { enabled: true, headSamplingRate: 0.01 },
      },
      // Parallel `alchemy dev` sessions isolate by STAGE with a deterministic
      // port; strictPort turns a port collision into a loud error instead of a
      // silent drift.
      ...(isDev ? { dev: { port, strictPort: true } } : {}),
      env: {
        AUTH_EMAIL_FROM: yield* (isDev ? Config.string("AUTH_EMAIL_FROM").pipe(Config.withDefault("App <noreply@localhost>")) : Config.string("AUTH_EMAIL_FROM")).pipe(
          Effect.orDie,
        ),
        // Without ROOT_DOMAIN the site lives on the platform host, and the
        // wildcard admits whatever `<name>.<account>.workers.dev` resolves
        // to. With one, only the stage's custom host is trusted.
        AUTH_ALLOWED_HOSTS: `localhost:*,127.0.0.1:*,${websiteUrl ?? "*.workers.dev"}`,
        R2_BUCKET_NAME: filesBucket.bucketName,
        R2_ACCOUNT_ID: accountId,
        // Optional by design: without them the app deploys, destroys, and
        // serves; images simply render without presigned URLs. CI always
        // receives minted values from the ceremony.
        R2_ACCESS_KEY_ID: yield* Config.string("R2_ACCESS_KEY_ID").pipe(Config.withDefault(""), Effect.orDie),
        R2_SECRET_ACCESS_KEY: yield* Config.redacted("R2_SECRET_ACCESS_KEY").pipe(Config.withDefault(Redacted.make("")), Effect.orDie),
      },
    };
  }),
  Effect.gen(function* () {
    // Init-time construction: better-auth gets its D1 adapter and the email
    // sender is built once, not per request.
    const authInstance = yield* Effect.provide(Auth, Auth.Live);
    const rateLimits = yield* Effect.provide(RateLimits, RateLimits.Live);

    // Product surface: Notes group behind the authentication middleware.
    const ApiRoutesLive = HttpApiBuilder.layer(AppApi);
    // Better Auth: its own framework, mounted as a raw catch-all before the
    // typed API. Tier 2 sits in front: 5 auth requests per minute per IP.
    // Every auth request can cost a real email, so floods stop here before
    // Better Auth's per-route D1 limits even run.
    const AuthRoutesLive = HttpRouter.addAll([
      HttpRouter.route(
        "*",
        "/api/auth/*",
        Effect.gen(function* () {
          const request = yield* HttpServerRequest;
          const allowed = yield* rateLimits.auth(`auth:${clientIp(request)}`);
          if (!allowed.success) return rateLimits.tooManyRequests;
          return yield* authInstance.fetch;
        }),
      ),
    ]);

    // The discharge edge: everything the routes need is provided HERE, before
    // toHttpEffect, so the resulting fetch carries no requirements that
    // alchemy cannot satisfy per request.

    const appLayer = Layer.mergeAll(ApiRoutesLive, AuthRoutesLive, DevRoutesLive).pipe(
      Layer.provide(ApiHandlers),
      Layer.provide(AuthenticatedLive),
      Layer.provide(Auth.Live),
      Layer.provide(NotesLive),
      Layer.provide(HttpServicesLive),
      Layer.provide(AppDatabase.Live),
      Layer.provide(Files.Live),
      Layer.provide(SchemaErrorHandlerLive),
      Layer.provide(Alchemy.RuntimeContext.phantom),
    );
    const app = yield* HttpRouter.toHttpEffect(appLayer);

    // Tier 1 wraps EVERYTHING the backend serves (typed API, auth mount, dev
    // routes): 300 requests per minute per IP. A bad-actor clamp, never a
    // domain rule, so it answers plain HTTP 429 + Retry-After rather than a
    // typed contract error.
    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const allowed = yield* rateLimits.global(`ip:${clientIp(request)}`);
        if (!allowed.success) return rateLimits.tooManyRequests;
        return yield* app;
      }),
    };
  }),
) {}

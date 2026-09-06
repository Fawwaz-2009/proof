import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { ALCHEMY_DEV } from "alchemy/Phase";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { Etag, HttpRouter } from "effect/unstable/http";
import * as HttpPlatform from "effect/unstable/http/HttpPlatform";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { allowedHostsConfig, Auth } from "../config/auth.ts";
import { AppDatabase } from "../config/database.ts";
import { emailFromConfig } from "../config/email.ts";
import { ambientStage, devPortFor } from "../config/stage.ts";
import { AppApi } from "./contracts/index.ts";
import { ApiHandlers } from "./controllers/index.ts";
import { NotesLive } from "./domain/notes.ts";
import { AuthenticatedLive } from "./middlewares/authentication.ts";
import { Files } from "../config/storage.ts";

/**
 * The Worker entry — the Init gen constructs each service once and builds the
 * services the routes close over; the discharge edge provides every remaining
 * requirement INTO the router, before `toHttpEffect`, so the fetch that
 * reaches alchemy requires only what alchemy serves per request.
 */

/** Platform services the HttpApi builder needs; a Worker has no filesystem, so it's a no-op. */
const HttpServicesLive = Layer.mergeAll(Path.layer, Etag.layerWeak, HttpPlatform.layer).pipe(Layer.provideMerge(FileSystem.layerNoop({})));

export default class Backend extends Cloudflare.Worker<Backend>()(
  "Backend",
  // The props read the ambient stage at synthesis; the deployed Worker
  // re-evaluates them without infrastructure context, where the
  // production-shaped fallback keeps the object total and unused.
  Effect.gen(function* () {
    const stage = yield* ambientStage;
    const isDev = yield* Effect.orDie(ALCHEMY_DEV);
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
      ...(isDev ? { dev: { port: devPortFor(stage), strictPort: true } } : {}),
      env: {
        AUTH_EMAIL_FROM: emailFromConfig,
        AUTH_ALLOWED_HOSTS: allowedHostsConfig,
      },
    };
  }),
  Effect.gen(function* () {
    // Init-time construction: better-auth gets its D1 adapter and the email
    // sender is built once, not per request.
    const authInstance = yield* Effect.provide(Auth, Auth.Live);

    // Product surface: Notes group behind the authentication middleware.
    const ApiRoutesLive = HttpApiBuilder.layer(AppApi);
    // Better Auth: its own framework, mounted as a raw catch-all before the typed API.
    const AuthRoutesLive = HttpRouter.addAll([HttpRouter.route("*", "/api/auth/*", authInstance.fetch)]);

    // The discharge edge: everything the routes need is provided HERE, before
    // toHttpEffect, so the resulting fetch carries no requirements that
    // alchemy cannot satisfy per request.

    const appLayer = Layer.mergeAll(ApiRoutesLive, AuthRoutesLive).pipe(
      Layer.provide(ApiHandlers),
      Layer.provide(AuthenticatedLive),
      Layer.provide(Auth.Live),
      Layer.provide(NotesLive),
      Layer.provide(HttpServicesLive),
      Layer.provide(AppDatabase.Live),
      Layer.provide(Files.Live),
      Layer.provide(Alchemy.RuntimeContext.phantom),
    );
    const app = yield* HttpRouter.toHttpEffect(appLayer);

    return { fetch: app };
  }),
) {}

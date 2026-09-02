import { BetterAuth } from "@alchemy.run/better-auth";
import { CloudflareD1 } from "@alchemy.run/better-auth/CloudflareD1";
import { ALCHEMY_DEV } from "alchemy/Phase";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { Etag, HttpPlatform, HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { authRuntimeSettings, buildAuthOptions, emailSenderEnabled, isDevMailboxUrl } from "../config/auth.config.ts";
import { backendEnvironmentFor, parseHostList } from "../config/environments.ts";
import { Database } from "../config/database.ts";
import { BucketPort, r2Port, type BackendEnvironment } from "../config/bindings.ts";
import { ambientStage, devPortFor } from "../config/stage.ts";
import { FilesBucket } from "../config/storage.ts";
import { DomainData } from "../config/database.ts";
import { AppApi, DevelopmentApi } from "./contracts/index.ts";
import { SessionHandlersLive } from "./controllers/session.ts";
import { NotesHandlersLive } from "./controllers/notes.ts";
import { DevMailboxHandlersLive, DevelopmentMailbox } from "./controllers/dev-mailbox.ts";
import { Authentication, AuthenticatedLive, type GetUser } from "./middlewares/authentication.ts";
import { NotesLive } from "./domain/notes/index.ts";

/**
 * The Worker entry — following overseer/skoreon: resources are created here,
 * the runtime environment is resolved here, and the HTTP assembly (the route
 * manifest) lives inline in the Init phase, closing over the resolved handles.
 * Everything a template would keep byte-identical between products — Better
 * Auth options, per-stage switches, resource+tag declarations — lives in
 * ../config and ./middlewares.
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
        ...backendEnvironmentFor(stage),
        FILES: FilesBucket,
      },
    };
  }),
  Effect.gen(function* () {
    const { database, db } = yield* DomainData;
    const authDatabase = CloudflareD1(database);
    const environment = (yield* Cloudflare.WorkerEnvironment) as BackendEnvironment;
    // The send_email binding is attached only where email is actually sent
    // (production). Every other stage captures codes in the development
    // mailbox, which also keeps alchemy's local runtime free of the binding.
    const sender = emailSenderEnabled(environment) ? yield* Cloudflare.Email.SendEmail("SignInEmail") : undefined;
    if (sender) yield* Cloudflare.Email.Send(sender);
    const { emailFrom, allowedHosts } = yield* authRuntimeSettings;
    const canAccessDevMailbox = (url: string) => isDevMailboxUrl(url, parseHostList(environment.DEV_MAILBOX_ALLOWED_HOSTS));

    const auth = yield* BetterAuth(buildAuthOptions({ environment, databaseLogicalId: database.LogicalId, sender, emailFrom, allowedHosts })).pipe(
      Effect.provide(authDatabase),
    );

    // The session bridge: Better Auth's session, projected onto the identity
    // the API layers know (SessionUser).
    const authentication: GetUser = (headers) =>
      auth.getSession(headers).pipe(
        Effect.orDie,
        Effect.map((session) =>
          session?.user
            ? {
                id: session.user.id,
                email: session.user.email,
                name: session.user.name || session.user.email,
              }
            : null,
        ),
      );

    // The route manifest — three surfaces on one fetch:
    // Product surface: Session + Notes groups behind the authentication middleware.
    const AppRoutesLive = HttpApiBuilder.layer(AppApi);
    // Better Auth: its own framework, mounted as a raw catch-all before the typed API.
    const AuthRoutesLive = HttpRouter.addAll([HttpRouter.route("*", "/api/auth/*", auth.fetch)]);
    // Development surface: mailbox read — no auth middleware by design, 404-cloaked.
    const DevelopmentRoutesLive = HttpApiBuilder.layer(DevelopmentApi);

    return {
      fetch: yield* HttpRouter.toHttpEffect(
        Layer.mergeAll(AppRoutesLive, AuthRoutesLive, DevelopmentRoutesLive).pipe(
          Layer.provide(Layer.mergeAll(SessionHandlersLive, NotesHandlersLive)),
          Layer.provide(DevMailboxHandlersLive),
          Layer.provide(NotesLive),
          Layer.provide(AuthenticatedLive),
          Layer.provide(Layer.succeed(Authentication, { getUser: authentication })),
          Layer.provide(Layer.mergeAll(Layer.succeed(Database, { db }), Layer.succeed(BucketPort, r2Port(environment.FILES)))),
          Layer.provide(Layer.succeed(DevelopmentMailbox, { db, canAccess: canAccessDevMailbox })),
          Layer.provide(HttpServicesLive),
          Layer.provide(Alchemy.RuntimeContext.phantom),
        ),
      ),
    };
  }).pipe(Effect.provide(Cloudflare.D1.QueryDatabaseBinding), Effect.provide(Cloudflare.Email.SendBinding)),
) {}

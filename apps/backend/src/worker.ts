import { BetterAuth } from "@alchemy.run/better-auth";
import { CloudflareD1 } from "@alchemy.run/better-auth/CloudflareD1";
import { ALCHEMY_DEV, ALCHEMY_PHASE } from "alchemy/Phase";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { Etag, HttpPlatform, HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import {
  OtpSender,
  allowedHostsConfig,
  authRuntimeSettings,
  buildAuthOptions,
  emailFromConfig,
  otpSenderEmailLive,
  otpSenderMailboxLive,
} from "../config/auth.config.ts";
import { devMailboxAllowedHosts, isDevMailboxUrl, otpDeliveryMode, parseHostList, switchesForStage } from "../config/env.ts";
import { Database } from "../config/database.ts";
import { ambientStage, devPortFor } from "../config/stage.ts";
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
        ...switchesForStage(stage),
        AUTH_EMAIL_FROM: emailFromConfig,
        AUTH_ALLOWED_HOSTS: allowedHostsConfig,
      },
    };
  }),
  Effect.gen(function* () {
    const { database, db } = yield* DomainData;
    const authDatabase = CloudflareD1(database);
    // Eager, validated reads of the shipped switches — but only in the runtime
    // phase, where alchemy's ConfigProvider serves the Worker's env. The CLI's
    // plan pass evaluates this same effect without that provider, so it takes
    // stage-derived fallbacks (mirroring `ambientStage`) that keep the binding
    // graph identical to a real deploy of the same stage.
    const stage = yield* ambientStage;
    const isRuntime = (yield* ALCHEMY_PHASE) === "runtime";
    const deliveryMode = isRuntime ? yield* otpDeliveryMode.pipe(Effect.orDie) : stage === "prod" ? "send" : "mailbox";
    const devMailboxHosts = parseHostList(isRuntime ? yield* devMailboxAllowedHosts.pipe(Effect.orDie) : "");
    const { emailFrom, allowedHosts } = yield* authRuntimeSettings.pipe(Effect.orDie);
    const isDevRuntime = yield* Effect.orDie(ALCHEMY_DEV);
    // The send_email binding is attached only where OTP codes are actually
    // delivered; every other stage — and any local `alchemy dev` runtime —
    // captures codes in the development mailbox.
    const captureOtp = deliveryMode === "mailbox" || isDevRuntime;
    const sender = captureOtp ? undefined : yield* Cloudflare.Email.SendEmail("Email");
    if (sender) yield* Cloudflare.Email.Send(sender);
    const canAccessDevMailbox = (url: string) => isDevMailboxUrl(url, devMailboxHosts);

    const otpSenderLive: Layer.Layer<OtpSender, never, Database | Cloudflare.Email.Send> =
      captureOtp || !sender ? otpSenderMailboxLive : otpSenderEmailLive(sender, emailFrom);
    const otpSender = Context.get(
      yield* Layer.build(Layer.provide(otpSenderLive, Layer.mergeAll(Layer.succeed(Database, { db }), Cloudflare.Email.SendBinding))),
      OtpSender,
    );

    const auth = yield* BetterAuth(buildAuthOptions({ otpSender, allowedHosts })).pipe(Effect.provide(authDatabase));
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
          Layer.provide(Layer.succeed(Database, { db })),
          Layer.provide(Cloudflare.R2.ReadWriteBucketBinding),
          Layer.provide(Layer.succeed(DevelopmentMailbox, { db, canAccess: canAccessDevMailbox })),
          Layer.provide(HttpServicesLive),
          Layer.provide(Alchemy.RuntimeContext.phantom),
        ),
      ),
    };
  }).pipe(Effect.provide(Cloudflare.D1.QueryDatabaseBinding), Effect.provide(Cloudflare.Email.SendBinding)),
) {}

import { BetterAuth } from "@alchemy.run/better-auth";
import { CloudflareD1 } from "@alchemy.run/better-auth/CloudflareD1";
import { ALCHEMY_DEV } from "alchemy/Phase";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { assembleRoutes } from "../config/routes.ts";
import { authRuntimeSettings, buildAuthOptions, emailSenderEnabled, isDevMailboxUrl } from "../config/auth.config.ts";
import { backendEnvironmentFor, parseHostList } from "../config/environments.ts";
import { DomainData } from "./database.ts";
import type { BackendEnvironment } from "./lib/bindings.ts";
import { ambientStage, devPortFor } from "./stage.ts";
import { FilesBucket } from "./storage.ts";

/**
 * The Worker entry: pure composition. Everything that a template would keep
 * byte-identical between products lives in ../config — per-stage switches
 * (environments.ts), Better Auth construction (auth.config.ts), and the route
 * table (routes.ts). This file only creates Alchemy resources, reads the
 * runtime environment, and hands handles to the config builders.
 */
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

    return yield* assembleRoutes({ auth, db, environment, canAccessDevMailbox });
  }).pipe(Effect.provide(Cloudflare.D1.QueryDatabaseBinding), Effect.provide(Cloudflare.Email.SendBinding)),
) {}

import { BetterAuth } from "@alchemy.run/better-auth";
import { CloudflareD1 } from "@alchemy.run/better-auth/CloudflareD1";
import * as Alchemy from "alchemy";
import { ALCHEMY_DEV } from "alchemy/Phase";
import * as Cloudflare from "alchemy/Cloudflare";
import { emailOTP } from "better-auth/plugins";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Etag, HttpPlatform, HttpRouter } from "effect/unstable/http";
import { AppApiLive, Authentication, DevelopmentApiLive, developmentMailboxLive, isDevMailboxUrl } from "./controllers/index.ts";
import { DomainData } from "./database.ts";
import { DevMailbox } from "./db/d1.ts";
import { notesLive } from "./domain/notes/index.ts";
import { ambientStage, devPortFor } from "./stage.ts";
import { FilesBucket } from "./storage.ts";

const DevMailboxEnvironment = Schema.Struct({ DEV_MAILBOX_ENABLED: Schema.String, DEV_MAILBOX_ALLOWED_HOSTS: Schema.String });

/** The runtime view of the Worker's env: the R2 bucket binding plus the auth switches. */
type BackendEnvironment = {
  readonly FILES: R2Bucket;
  readonly DEV_MAILBOX_ENABLED: string;
  readonly DEV_MAILBOX_ALLOWED_HOSTS: string;
  readonly EMAIL_SENDER: string;
  readonly [key: string]: unknown;
};

/** The bucket port over the Worker's native R2 binding; rejections surface as defects at the call site. */
const r2Port = (bucket: R2Bucket) => ({
  putObject: (key: string, bytes: Uint8Array, contentType: string, name: string) =>
    Effect.promise(async () => {
      await bucket.put(key, bytes, { httpMetadata: { contentType }, customMetadata: { name } });
    }),
  deleteObject: (key: string) =>
    Effect.promise(async () => {
      await bucket.delete(key);
    }),
  getObject: (key: string) =>
    Effect.promise(async () => {
      const object = await bucket.get(key);
      if (!object) return null;
      const bytes = new Uint8Array(await object.arrayBuffer());
      return { bytes, contentType: object.httpMetadata?.contentType ?? "" };
    }),
});

export default class Backend extends Cloudflare.Worker<Backend>()(
  "Backend",
  // The props read the ambient stage at synthesis; the deployed Worker
  // re-evaluates them without infrastructure context, where the
  // production-shaped fallback keeps the object total and unused.
  Effect.gen(function* () {
    const stage = yield* ambientStage;
    const nonProduction = stage !== "prod";
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
        DEV_MAILBOX_ENABLED: nonProduction ? "true" : "false",
        DEV_MAILBOX_ALLOWED_HOSTS: nonProduction ? "*.workers.dev" : "",
        EMAIL_SENDER: nonProduction ? "disabled" : "enabled",
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
    const sender = environment.EMAIL_SENDER === "enabled" ? yield* Cloudflare.Email.SendEmail("SignInEmail") : undefined;
    if (sender) yield* Cloudflare.Email.Send(sender);
    const emailFrom = yield* Config.string("AUTH_EMAIL_FROM").pipe(Config.withDefault("Sufra <noreply@localhost>"));
    const allowedHosts = (yield* Config.string("AUTH_ALLOWED_HOSTS").pipe(Config.withDefault("localhost:*,127.0.0.1:*,*.workers.dev")))
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean);
    const devMailboxEnvironment = () => Schema.decodeUnknownSync(DevMailboxEnvironment)(environment);
    const canAccessDevMailbox = (url: string) =>
      isDevMailboxUrl(
        url,
        devMailboxEnvironment()
          .DEV_MAILBOX_ALLOWED_HOSTS.split(",")
          .map((host) => host.trim())
          .filter(Boolean),
      );

    const auth = yield* BetterAuth({
      id: "SufraAuth",
      appName: "Sufra",
      basePath: "/api/auth",
      baseURL: { allowedHosts, protocol: "auto" },
      trustedOrigins: [...allowedHosts.map((host) => `https://${host}`), "http://localhost:*", "http://127.0.0.1:*"],
      advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
      rateLimit: {
        enabled: true,
        storage: "database",
        window: 60,
        max: 30,
        customRules: {
          "/email-otp/send-verification-otp": { window: 60, max: 3 },
          "/sign-in/email-otp": { window: 60, max: 10 },
        },
      },
      plugins: [
        emailOTP({
          allowedAttempts: 5,
          expiresIn: 15 * 60,
          otpLength: 6,
          storeOTP: "hashed",
          sendVerificationOTP: async ({ email, otp, type }, ctx) => {
            const request = ctx?.request;
            const local = request ? canAccessDevMailbox(request.url) : false;
            if ((devMailboxEnvironment().DEV_MAILBOX_ENABLED === "true" || local) && type === "sign-in") {
              const runtimeDb = drizzleD1(environment[database.LogicalId] as D1Database);
              await runtimeDb
                .insert(DevMailbox)
                .values({ email: email.toLowerCase(), code: otp })
                .onConflictDoUpdate({
                  target: DevMailbox.email,
                  set: { code: otp, sentAt: new Date() },
                });
            } else if (!sender) {
              throw new Error(`No email sender is attached on this stage; the sign-in code for ${email} was not delivered.`);
            } else {
              const emailBinding = environment[sender.name] as SendEmail;
              await emailBinding.send({
                from: emailFrom,
                to: email,
                subject: "Your Sufra sign-in code",
                text: `Your Sufra sign-in code is ${otp}. It expires in 15 minutes.`,
                html: `<p>Your Sufra sign-in code is <strong>${otp}</strong>.</p><p>It expires in 15 minutes.</p>`,
              });
            }
          },
        }),
      ],
    }).pipe(Effect.provide(authDatabase));

    const AuthenticationLive = Layer.succeed(Authentication)({
      getUser: (headers) =>
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
        ),
    });
    const AppRoutesLive = AppApiLive.pipe(Layer.provide(notesLive(db, r2Port(environment.FILES))), Layer.provide(AuthenticationLive));
    const AuthRoutesLive = HttpRouter.addAll([HttpRouter.route("*", "/api/auth/*", auth.fetch)]);
    const DevelopmentRoutesLive = DevelopmentApiLive.pipe(Layer.provide(developmentMailboxLive(db, canAccessDevMailbox)));
    const RoutesLive = Layer.mergeAll(AppRoutesLive, AuthRoutesLive, DevelopmentRoutesLive);
    const HttpServicesLive = Layer.mergeAll(Path.layer, Etag.layerWeak, HttpPlatform.layer).pipe(Layer.provideMerge(FileSystem.layerNoop({})));
    const fetch = yield* HttpRouter.toHttpEffect(RoutesLive.pipe(Layer.provide(HttpServicesLive), Layer.provide(Alchemy.RuntimeContext.phantom)));
    return { fetch };
  }).pipe(Effect.provide(Cloudflare.D1.QueryDatabaseBinding), Effect.provide(Cloudflare.Email.SendBinding)),
) {}

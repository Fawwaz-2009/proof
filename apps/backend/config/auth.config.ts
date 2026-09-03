import type { BetterAuthProps } from "@alchemy.run/better-auth";
import { Email } from "alchemy/Cloudflare";
import * as Alchemy from "alchemy";
import { emailOTP } from "better-auth/plugins";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DevMailbox } from "../src/db/d1.ts";
import { Database } from "./database.ts";
import { parseHostList } from "./env.ts";

/**
 * Better Auth construction — the `config/initializers` analogue. Pure builder
 * plus the OTP delivery port: no Alchemy resources are created here (the
 * Worker entry owns those), and the module is safe to evaluate at plan time
 * and in the deployed runtime.
 */

const defaultAllowedHosts = "localhost:*,127.0.0.1:*,*.workers.dev";

/** The AUTH_* env vars as Config values, so the same constant ships the var in the props and reads it back at runtime. */
export const emailFromConfig = Config.string("AUTH_EMAIL_FROM").pipe(Config.withDefault("Sufra <noreply@localhost>"));
export const allowedHostsConfig = Config.string("AUTH_ALLOWED_HOSTS").pipe(Config.withDefault(defaultAllowedHosts));

export type AuthRuntimeSettings = {
  readonly emailFrom: string;
  readonly allowedHosts: Array<string>;
};

/** Reads the AUTH_* settings through the Worker's ConfigProvider. */
export const authRuntimeSettings = Effect.gen(function* () {
  const emailFrom = yield* emailFromConfig;
  const allowedHosts = yield* allowedHostsConfig;
  return { emailFrom, allowedHosts: parseHostList(allowedHosts) };
});

/** The OTP delivery service shape; Better Auth's callback bridges it to promises. */
export type OtpSenderService = {
  readonly send: (input: { readonly email: string; readonly code: string }) => Effect.Effect<void>;
};

/**
 * OTP delivery port: sign-in codes are delivered without ever failing the
 * auth flow (E = never by contract). The entry picks the adapter — dev
 * mailbox capture on development stages and local runtimes, the send_email
 * binding elsewhere.
 */
export class OtpSender extends Context.Service<OtpSender, OtpSenderService>()("Backend/OtpSender") {}

/** Dev adapter: upsert the code into the mailbox table for the auto-fill flow. Failures die loudly — this only runs in development. */
export const otpSenderMailboxLive: Layer.Layer<OtpSender, never, Database> = Layer.effect(
  OtpSender,
  Effect.gen(function* () {
    const { db } = yield* Database;
    return {
      send: ({ email, code }) =>
        Effect.scoped(
          db
            .insert(DevMailbox)
            .values({ email: email.toLowerCase(), code })
            .onConflictDoUpdate({
              target: DevMailbox.email,
              set: { code, sentAt: new Date() },
            }),
        ).pipe(Effect.orDie),
    };
  }),
);

/** Production adapter: deliver via the send_email binding. Delivery failures are logged, never thrown — a mail outage must not lock sign-in. */
export const otpSenderEmailLive = (sender: Email.SendEmail, emailFrom: string): Layer.Layer<OtpSender, never, Email.Send> =>
  Layer.effect(
    OtpSender,
    Effect.gen(function* () {
      const email = yield* Email.Send(sender);
      return {
        send: ({ email: to, code }) =>
          email
            .send({
              from: emailFrom,
              to,
              subject: "Your Sufra sign-in code",
              text: `Your Sufra sign-in code is ${code}. It expires in 15 minutes.`,
              html: `<p>Your Sufra sign-in code is <strong>${code}</strong>.</p><p>It expires in 15 minutes.</p>`,
            })
            .pipe(
              Effect.asVoid,
              Effect.catch(() => Effect.log(`Sign-in code email to ${to} failed`).pipe(Effect.asVoid)),
              Effect.provide(Alchemy.RuntimeContext.phantom),
            ),
      };
    }),
  );

export type BuildAuthOptionsInput = {
  /** The resolved OTP delivery adapter. */
  readonly otpSender: OtpSenderService;
  readonly allowedHosts: ReadonlyArray<string>;
};

export const buildAuthOptions = ({ otpSender, allowedHosts }: BuildAuthOptionsInput): BetterAuthProps => ({
  appName: "Sufra",
  basePath: "/api/auth",
  baseURL: { allowedHosts: [...allowedHosts], protocol: "auto" },
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
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== "sign-in") return;
        await Effect.runPromise(otpSender.send({ email, code: otp }));
      },
    }),
  ],
});

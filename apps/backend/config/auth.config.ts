import type { BetterAuthProps } from "@alchemy.run/better-auth";
import { emailOTP } from "better-auth/plugins";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { DevMailbox } from "../src/db/d1.ts";
import { defaultAllowedHosts, parseHostList } from "./environments.ts";

/**
 * Better Auth construction — the `config/initializers` analogue. Pure builder:
 * takes the runtime bindings and values, returns the options object. No
 * Alchemy resources are created here (the Worker entry owns those), and the
 * module is safe to evaluate at plan time and in the deployed runtime.
 */

const DevMailboxEnvironment = Schema.Struct({ DEV_MAILBOX_ENABLED: Schema.String, DEV_MAILBOX_ALLOWED_HOSTS: Schema.String });

/**
 * Host rule for OTP-related development access: `http://localhost` always
 * qualifies; deployed non-prod stages add `*.workers.dev` through the
 * `DEV_MAILBOX_ALLOWED_HOSTS` env, production ships an empty list.
 */
export const isDevMailboxUrl = (value: string, allowedHosts: ReadonlyArray<string> = []): boolean => {
  try {
    const { host, hostname, protocol } = new URL(value);
    const matchesAllowedHost = allowedHosts.some((allowedHost) => {
      const normalized = allowedHost.trim().toLowerCase();
      if (normalized.startsWith("*.")) {
        const suffix = normalized.slice(1);
        return hostname.endsWith(suffix) && hostname.length > suffix.length;
      }
      return normalized === host;
    });
    return (
      (protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost"))) ||
      ((protocol === "http:" || protocol === "https:") && matchesAllowedHost)
    );
  } catch {
    return false;
  }
};

export type AuthRuntimeSettings = {
  readonly emailFrom: string;
  readonly allowedHosts: Array<string>;
};

/** AUTH_EMAIL_FROM / AUTH_ALLOWED_HOSTS with template defaults; read via Effect Config so deploys can override. */
export const authRuntimeSettings = Effect.gen(function* () {
  const emailFrom = yield* Config.string("AUTH_EMAIL_FROM").pipe(Config.withDefault("Sufra <noreply@localhost>"));
  const allowedHosts = yield* Config.string("AUTH_ALLOWED_HOSTS").pipe(Config.withDefault(defaultAllowedHosts));
  return { emailFrom, allowedHosts: parseHostList(allowedHosts) };
});

export type BuildAuthOptionsInput = {
  /** The Worker's runtime environment (bindings + env strings). */
  readonly environment: Record<string, unknown>;
  /** Logical id of the D1 database resource — the env key its binding lives under. */
  readonly databaseLogicalId: string;
  /** Attached only when EMAIL_SENDER is enabled (production stages). */
  readonly sender: { readonly name: string } | undefined;
  readonly emailFrom: string;
  readonly allowedHosts: ReadonlyArray<string>;
};

/** The email sender env flag; the OTP send path refuses to run without it. */
export const emailSenderEnabled = (environment: Record<string, unknown>): boolean => environment.EMAIL_SENDER === "enabled";

export const buildAuthOptions = ({ environment, databaseLogicalId, sender, emailFrom, allowedHosts }: BuildAuthOptionsInput): BetterAuthProps => ({
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
      sendVerificationOTP: async ({ email, otp, type }, ctx) => {
        const request = ctx?.request;
        const devMailboxEnvironment = Schema.decodeUnknownSync(DevMailboxEnvironment)(environment);
        const local = request ? isDevMailboxUrl(request.url, parseHostList(devMailboxEnvironment.DEV_MAILBOX_ALLOWED_HOSTS)) : false;
        if ((devMailboxEnvironment.DEV_MAILBOX_ENABLED === "true" || local) && type === "sign-in") {
          const runtimeDb = drizzleD1(environment[databaseLogicalId] as D1Database);
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
});

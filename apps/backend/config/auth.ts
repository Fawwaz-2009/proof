import { BetterAuth } from "@alchemy.run/better-auth";
import { CloudflareD1 } from "@alchemy.run/better-auth/CloudflareD1";
import { emailOTP } from "better-auth/plugins";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Context } from "effect";
import { Email } from "./email.ts";
import { d1Database } from "./database/index.ts";

/** Hosts the backend accepts auth traffic from. Always bound via props env:
 * derived from the stage's website domain (see worker.ts + config/domain.ts). */
/**
 * The localhost fallback is load-bearing: Auth.make runs during `alchemy dev`
 * synthesis, outside any binding context. Deployed stages get the derived
 * hosts via the AUTH_ALLOWED_HOSTS binding (see worker.ts).
 */
export const allowedHostsConfig = Config.string("AUTH_ALLOWED_HOSTS").pipe(Config.withDefault("localhost:*,127.0.0.1:*,*.workers.dev"));

/**
 * The dev sign-in trick: on capture stages an address whose local part is
 * exactly six digits signs in with those digits (123456@dev.example.com
 * gets 123456). The anchor is the whole security story: a real address
 * cannot be made to carry a six-digit local part, so no crafted address
 * predicts someone else's code; the only addresses that work this way are
 * ones the visitor invented on a throwaway stage. Production ignores the
 * format entirely.
 */
export const otpFromAddress = (email: string): string | null => {
  const match = /^(\d{6})@/.exec(email);
  return match?.[1] ?? null;
};

export class Auth extends Context.Service<Auth>()("Auth", {
  make: Effect.gen(function* () {
    const mail = yield* Email;
    const appName = yield* Config.string("APP_NAME").pipe(Config.withDefault("App"), Effect.orDie);
    const effectContext = yield* Effect.context<never>();
    const allowedHosts = (yield* allowedHostsConfig.pipe(Effect.orDie))
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean);

    return yield* BetterAuth({
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
          // Capture stages only (mail.mode is the same switch that decides
          // delivery): the code is the address's six digits, so the login
          // page needs no mailbox and no log-digging. Returning undefined
          // keeps better-auth's random code everywhere else.
          generateOTP: ({ email }) => (mail.mode === "captured" ? (otpFromAddress(email) ?? undefined) : undefined),
          sendVerificationOTP: async ({ email, otp, type }) => {
            if (type !== "sign-in") return;
            await Effect.runPromiseWith(effectContext)(
              mail.send({
                to: email,
                subject: `Your ${appName} sign-in code`,
                text: `Your ${appName} sign-in code is ${otp}. It expires in 15 minutes.`,
                html: `<p>Your ${appName} sign-in code is <strong>${otp}</strong>.</p><p>It expires in 15 minutes.</p>`,
              }),
            );
          },
        }),
      ],
    });
  }),
}) {
  static readonly Live = Layer.effect(this, this.make).pipe(Layer.provide(Layer.mergeAll(Email.Live, CloudflareD1(d1Database))));
}

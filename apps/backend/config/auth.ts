import { BetterAuth } from "@alchemy.run/better-auth";
import { CloudflareD1 } from "@alchemy.run/better-auth/CloudflareD1";
import { expo } from "@better-auth/expo";
import { emailOTP } from "better-auth/plugins";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Context } from "effect";
import { Email } from "./email.ts";
import { d1Database } from "./database/index.ts";
import { environment } from "./environment.ts";

/** Hosts the backend accepts auth traffic from. Always bound via props env:
 * derived from the stage's website domain (see worker.ts + config/domain.ts). */
/**
 * The localhost fallback is load-bearing: Auth.make runs during `alchemy dev`
 * synthesis, outside any binding context. Deployed stages get the derived
 * hosts via the AUTH_ALLOWED_HOSTS binding (see worker.ts).
 */
export const allowedHostsConfig = Config.String("AUTH_ALLOWED_HOSTS").pipe(Config.withDefault("localhost:*,127.0.0.1:*,*.workers.dev"));

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
    const appName = yield* Config.String("APP_NAME").pipe(Config.withDefault("App"), Effect.orDie);
    // The native app's deep-link scheme. app.config.ts derives it from the
    // same env (APP_SLUG), and native auth traffic arrives declaring
    // `<scheme>://` as its origin, so the backend trusts exactly that.
    const appSlug = yield* Config.String("APP_SLUG").pipe(Config.withDefault("app"), Effect.orDie);
    const stage = yield* environment;
    const effectContext = yield* Effect.context<never>();
    const allowedHosts = (yield* allowedHostsConfig.pipe(Effect.orDie))
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean);

    return yield* BetterAuth({
      basePath: "/api/auth",
      baseURL: { allowedHosts, protocol: "auto" },
      // Custom schemes are trusted whole: a host-less entry matches every host
      // and path of that scheme. Capture stages accept the preview app's scheme
      // plus the production one (a production build pointed at a preview
      // backend); production accepts only the production scheme. No wildcards.
      // A template that later enables magic links or email verification should
      // remember that better-auth hands the session cookie to the deep link's
      // `?cookie=` on those flows, and any app claiming the scheme can read it.
      trustedOrigins: [
        ...allowedHosts.map((host) => `https://${host}`),
        "http://localhost:*",
        "http://127.0.0.1:*",
        ...(stage === "prod" ? [`${appSlug}://`] : [`${appSlug}-preview://`, `${appSlug}://`]),
      ],
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
        // Native clients (the Expo app) declare the app scheme as their
        // origin; the expo plugin teaches better-auth to accept those
        // requests and answer deep links.
        expo(),
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

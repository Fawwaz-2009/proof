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
export const allowedHostsConfig = Config.string("AUTH_ALLOWED_HOSTS").pipe(
  Config.withDefault("localhost:*,127.0.0.1:*,*.workers.dev"),
);

export class Auth extends Context.Service<Auth>()("Auth", {
  make: Effect.gen(function* () {
    const mail = yield* Email;
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
          sendVerificationOTP: async ({ email, otp, type }) => {
            if (type !== "sign-in") return;
            await Effect.runPromiseWith(effectContext)(
              mail.send({
                to: email,
                subject: "Your Alchemy Flare sign-in code",
                text: `Your Alchemy Flare sign-in code is ${otp}. It expires in 15 minutes.`,
                html: `<p>Your Alchemy Flare sign-in code is <strong>${otp}</strong>.</p><p>It expires in 15 minutes.</p>`,
              }),
            );
          },
        }),
      ],
    });
  }),
}) {
  static readonly Live = Layer.effect(this, this.make).pipe(
    Layer.provide(Layer.mergeAll(Email.Live, CloudflareD1(d1Database))),
  );
}

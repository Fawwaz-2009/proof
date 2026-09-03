/**
 * The auth service: constructed as a plain effect from the email service.
 * Validates: does BetterAuth need the Memory provide (package contract),
 * and does Effect.runPromise(email.send(...)) behave outside a request context.
 */
import { BetterAuth } from "@alchemy.run/better-auth";
import { Memory } from "@alchemy.run/better-auth/Memory";
import { emailOTP } from "better-auth/plugins";
import * as Effect from "effect/Effect";
import { emailSender } from "./email.ts";

export const auth = Effect.gen(function* () {
  const email = yield* emailSender;
  return yield* BetterAuth({
    basePath: "/api/auth",
    plugins: [
      emailOTP({
        allowedAttempts: 5,
        expiresIn: 15 * 60,
        otpLength: 6,
        storeOTP: "hashed",
        sendVerificationOTP: async ({ email: to, otp, type }) => {
          if (type !== "sign-in") return;
          await Effect.runPromise(
            email.send({
              to,
              subject: "Your Sufra sign-in code",
              text: `Your Sufra sign-in code is ${otp}. It expires in 15 minutes.`,
            }),
          );
        },
      }),
    ],
  }).pipe(Effect.provide(Memory()));
});

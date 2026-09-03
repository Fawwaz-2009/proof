/**
 * The auth service: built once at worker init. Its dependencies (the email
 * sender, the better-auth D1 adapter) are provided by the worker at the
 * provide site, not reached for globally.
 */
import { BetterAuth } from "@alchemy.run/better-auth";
import { emailOTP } from "better-auth/plugins";
import * as Effect from "effect/Effect";
import { EmailSender } from "./email.js";

export const auth = Effect.gen(function* () {
  const effectContext = yield* Effect.context<never>();

  const mail = yield* EmailSender;

  return yield* BetterAuth({
    basePath: "/api/auth",
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
              subject: "Your Sufra sign-in code",
              text: `Your Sufra sign-in code is ${otp}. It expires in 15 minutes.`,
            }),
          );
        },
      }),
    ],
  });
});

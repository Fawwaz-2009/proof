/**
 * The auth service: constructed as a plain effect from the database resource
 * and the email service. Sign-in code persistence returns when the drizzle
 * handle slice lands (see REBUILD LADDER in src/worker.ts).
 */
import { BetterAuth } from "@alchemy.run/better-auth";
import { emailOTP } from "better-auth/plugins";
import * as Effect from "effect/Effect";
import { emailSender } from "./email.ts";

export const auth = Effect.gen(function* () {
  const mail = yield* emailSender;
  return yield* BetterAuth({
    basePath: "/api/auth",
    plugins: [
      emailOTP({
        allowedAttempts: 5,
        expiresIn: 15 * 60,
        otpLength: 6,
        storeOTP: "hashed",
        sendVerificationOTP: async ({ email, otp: _otp, type }) => {
          if (type !== "sign-in") return;
          // Persistence + delivery through the domain concept return with the
          // drizzle-handle slice. The capture sink inside emailSender proves
          // the callback fires.
          await Effect.runPromise(
            mail.send({
              to: email,
              subject: "Your Sufra sign-in code",
              text: `Your Sufra sign-in code is ${_otp}. It expires in 15 minutes.`,
            }),
          );
        },
      }),
    ],
  });
});

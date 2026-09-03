/**
 * The auth service: a zero-arg effect that yields its own dependencies. The
 * package's Database requirement is provided at the worker.
 */
import { BetterAuth } from "@alchemy.run/better-auth";
import { emailOTP } from "better-auth/plugins";
import * as Effect from "effect/Effect";
import { Database } from "./database.ts";
import { emailSender } from "./email.ts";

export const auth = Effect.gen(function* () {
  const database = yield* Database;
  const mail = yield* emailSender;

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
          // Persistence through the domain concept returns with the
          // drizzle-handle slice (open seam — see config/database.ts).
          await Effect.runPromise(mail.send({
            to: email,
            subject: "Your Sufra sign-in code",
            text: `Your Sufra sign-in code is ${otp}. It expires in 15 minutes.`,
          }));
        },
      }),
    ],
  });
});

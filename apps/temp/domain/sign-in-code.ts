/**
 * The sign-in code: the app's one domain concept. Issuing persists the code
 * (latest per email) and delivers it through the email service.
 *
 * Dependencies arrive as arguments (the controller closes over the constructed
 * services), so this module is plain Effect + domain logic: no service tags,
 * no layer wiring, trivially unit-testable with fakes.
 */
import { eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Schema } from "effect";
import type { DatabaseShape } from "../config/database.js";
import type { EmailSenderShape } from "../config/email.js";
import { SignInCode, SignInCodeSelectSchema } from "../src/schema.js";

export type IssueSignInCodeInput = { readonly email: string; readonly code: string };

export const issueSignInCode = (deps: { readonly db: DatabaseShape; readonly email: EmailSenderShape }, input: IssueSignInCodeInput) =>
  Effect.gen(function* () {
    const result = yield* deps.db
      .insert(SignInCode)
      .values({ email: input.email.toLowerCase(), code: input.code })
      .onConflictDoUpdate({
        target: SignInCode.email,
        set: { code: input.code, createdAt: new Date() },
      })
      .returning();

    yield* deps.email.send({
      to: input.email,
      subject: "Your Sufra sign-in code",
      text: `Your Sufra sign-in code is ${input.code}. It expires in 15 minutes.`,
      html: `<p>Your Sufra sign-in code is <strong>${input.code}</strong>.</p><p>It expires in 15 minutes.</p>`,
    });
    return yield* Schema.decodeEffect(SignInCodeSelectSchema)(result[0]!).pipe(Effect.orDie);
  });

export const latestSignInCode = (deps: { readonly db: DatabaseShape }, recipient: string) =>
  Effect.gen(function* () {
    const row = yield* deps.db.select().from(SignInCode).where(eq(SignInCode.email, recipient.toLowerCase())).limit(1);
    return yield* Schema.decodeEffect(SignInCodeSelectSchema)(row[0]!).pipe(Effect.orDie);
  });

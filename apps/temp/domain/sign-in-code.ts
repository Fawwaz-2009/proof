// PARKED — returns with the drizzle-handle slice (see src/worker.ts ladder).
// /**
//  * The sign-in code: the app's one domain concept. Issuing persists the code
//  * (latest per email) and delivers it through the email service.
//  */
// import { eq } from "drizzle-orm";
// import * as Effect from "effect/Effect";
// import type { DomainDb } from "../config/database.ts";
// import type { EmailSender } from "../config/email.ts";
// import { SignInCode } from "../src/db/d1.ts";
//
// export type IssueSignInCodeInput = { readonly email: string; readonly code: string };
//
// export const issueSignInCode = (db: DomainDb, email: EmailSender, input: IssueSignInCodeInput) =>
//   Effect.gen(function* () {
//     yield* Effect.scoped(
//       db
//         .insert(SignInCode)
//         .values({ email: input.email.toLowerCase(), code: input.code })
//         .onConflictDoUpdate({
//           target: SignInCode.email,
//           set: { code: input.code, createdAt: new Date() },
//         }),
//     ).pipe(Effect.orDie);
//     yield* email.send({
//       to: input.email,
//       subject: "Your Sufra sign-in code",
//       text: `Your Sufra sign-in code is ${input.code}. It expires in 15 minutes.`,
//       html: `<p>Your Sufra sign-in code is <strong>${input.code}</strong>.</p><p>It expires in 15 minutes.</p>`,
//     });
//   });
//
// export const latestSignInCode = (db: DomainDb, recipient: string) =>
//   db
//     .select()
//     .from(SignInCode)
//     .where(eq(SignInCode.email, recipient.toLowerCase()))
//     .limit(1)
//     .pipe(Effect.orDie);

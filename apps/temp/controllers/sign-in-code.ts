// PARKED — returns with the drizzle-handle slice (see src/worker.ts ladder).
// import * as Effect from "effect/Effect";
// import { HttpApiBuilder } from "effect/unstable/httpapi";
// import type { DomainDb } from "../config/database.ts";
// import type { EmailSender } from "../config/email.ts";
// import { SignInCodeNotFound, SignInCodeView, TempApi } from "../contract/temp.ts";
// import { issueSignInCode, latestSignInCode } from "../domain/sign-in-code.ts";
//
// /** The sign-in code surface: issue on behalf of an email, read the latest. */
// export const signInCodeHandlers = (db: DomainDb, email: EmailSender) =>
//   HttpApiBuilder.group(TempApi, "sign-in-codes", (handlers) =>
//     Effect.gen(function* () {
//       return handlers.handleAll({
//         issueSignInCode: ({ payload }) =>
//           Effect.map(
//             issueSignInCode(db, email, { email: payload.email, code: code6() }),
//             () => new SignInCodeView({ email: payload.email, code: "" }),
//           ),
//         getLatestSignInCode: ({ params }) =>
//           Effect.gen(function* () {
//             const rows = yield* latestSignInCode(db, params.email);
//             const row = rows[0];
//             if (!row) return yield* new SignInCodeNotFound({ email: params.email });
//             return new SignInCodeView({ email: row.email, code: row.code });
//           }),
//       });
//     }),
//   );
//
// const code6 = (): string => String(Math.floor(100000 + Math.random() * 900000));

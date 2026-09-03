import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Database } from "../config/database.ts";
import { emailSender } from "../config/email.ts";
import { SignInCodeNotFound, SignInCodeView, TempApi } from "../contract/temp.ts";
import { issueSignInCode, latestSignInCode } from "../domain/sign-in-code.ts";

/** The sign-in code surface: issue on behalf of an email, read the latest. */
export const signInCodeHandlers = Effect.gen(function* () {
  const database = yield* Database;
  const email = yield* emailSender;

  return HttpApiBuilder.group(TempApi, "sign-in-codes", (handlers) =>
    Effect.gen(function* () {
      return handlers.handleAll({
        issueSignInCode: ({ payload }) =>
          Effect.map(
            issueSignInCode(database, email, { email: payload.email, code: code6() }),
            () => new SignInCodeView({ email: payload.email, code: "" }),
          ),
        getLatestSignInCode: ({ params }) =>
          Effect.gen(function* () {
            const rows = yield* latestSignInCode(database, params.email);
            const row = rows[0];
            if (!row) return yield* new SignInCodeNotFound({ email: params.email });
            return new SignInCodeView({ email: row.email, code: row.code });
          }),
      });
    }),
  );
});

const code6 = (): string => String(Math.floor(100000 + Math.random() * 900000));

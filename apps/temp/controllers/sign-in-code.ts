import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Database } from "../config/database.js";
import { EmailSender } from "../config/email.js";
import { TempApi } from "../contract/temp";
import { issueSignInCode, latestSignInCode } from "../domain/sign-in-code";

/**
 * The sign-in code surface: issue on behalf of an email, read the latest.
 * Services are yielded at BUILD time (the layer closes over them), so the
 * per-request R channel carries nothing beyond what alchemy provides.
 */
export const signInCodeHandlers = HttpApiBuilder.group(TempApi, "sign-in-codes", (handlers) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const email = yield* EmailSender;
    return handlers.handleAll({
      issueSignInCode: ({ payload }) =>
        issueSignInCode({ db, email }, { email: payload.email, code: code6() }),
      getLatestSignInCode: ({ params }) => latestSignInCode({ db }, params.email),
    });
  }),
);

const code6 = (): string => String(Math.floor(100000 + Math.random() * 900000));

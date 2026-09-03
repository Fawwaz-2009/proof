import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { emailSender } from "../config/email.ts";
import { SendEmailResponse, TempApi } from "../contract/temp.ts";
import { environment } from "../config/environment.ts";

/** Probe surface: exercises the contract and the email service. */
export const tempHandlers = Effect.gen(function* () {
  const email = yield* emailSender;
  return HttpApiBuilder.group(TempApi, "temp", (handlers) =>
    Effect.gen(function* () {
      return handlers.handleAll({
        getEnvironment: () => Effect.map(environment, (env) => ({ environment: env })),
        sendEmail: ({ payload }) =>
          Effect.map(email.send({ to: payload.to, subject: payload.subject, text: payload.text }), () => new SendEmailResponse({ status: email.mode })),
      });
    }),
  );
});

import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { EmailSender } from "../config/email.js";
import { SendEmailResponse, TempApi } from "../contract/temp.js";
import { environment } from "../config/environment.js";

/**
 * Probe surface: exercises the contract and the email service.
 * EmailSender is yielded at BUILD time (the layer closes over it); per-request
 * yields would land in the Requires slot, which nothing provides here.
 */
export const tempHandlers = HttpApiBuilder.group(TempApi, "temp", (handlers) =>
  Effect.gen(function* () {
    const email = yield* EmailSender;
    return handlers.handleAll({
      getEnvironment: () => Effect.map(environment, (env) => ({ environment: env })),
      sendEmail: ({ payload }) =>
        Effect.map(email.send({ to: payload.to, subject: payload.subject, text: payload.text }), () => new SendEmailResponse({ status: email.mode })),
    });
  }),
);

/**
 * The email service: handlers yield the `EmailSender` tag and call send. The
 * environment decides inside — non-prod captures to logs, prod delivers through
 * the send_email binding. E = never: a mail failure never reaches the caller.
 */
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Context, Effect, Layer } from "effect";
import { environment } from "./environment";

// Declared outside so the stack and the worker reference the same resource.
export const EmailResource = Cloudflare.Email.SendEmail("Email");

const makeEmailSender = Effect.gen(function* () {
  const env = yield* environment;
  if (env !== "prod") {
    return {
      mode: "captured" as const,
      send: (message: { to: string; subject: string; text?: string; html?: string }) =>
        Effect.log(`[temp/email] captured (${env}) to=${message.to} subject=${message.subject} text=${message.text ?? ""}`).pipe(Effect.asVoid),
    };
  }

  const email = yield* Cloudflare.Email.Send(EmailResource);
  return {
    mode: "sent" as const,
    send: (message: { to: string; subject: string; text?: string; html?: string }) =>
      email
        .send({
          from: "Sufra <noreply@send.sufra.app>",
          to: message.to,
          subject: message.subject,
          ...(message.html ? { html: message.html } : { text: message.text ?? "" }),
        })
        .pipe(
          Effect.asVoid,
          Effect.catch(() => Effect.log(`[temp/email] delivery to ${message.to} failed`).pipe(Effect.asVoid)),
          Effect.provide(Alchemy.RuntimeContext.phantom),
        ),
  };
});

/** The sender shape, inferred from the constructor; consumers yield the tag. */
export type EmailSenderShape = Effect.Success<typeof makeEmailSender>;

/** Handlers yield `EmailSender`; the worker provides `EmailSenderLive` at the router. */
export class EmailSender extends Context.Service<EmailSender, EmailSenderShape>()(
  "@sufra/EmailSender",
) {}

/** Built once per isolate; the send binding is discharged here, not per request. */
export const EmailSenderLive = Layer.effect(EmailSender, makeEmailSender).pipe(
  Layer.provide(Cloudflare.Email.SendBinding),
);

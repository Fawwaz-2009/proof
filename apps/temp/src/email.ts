/**
 * The email service: consumers yield it and call send. The environment
 * decides inside — non-prod captures to logs, prod provisions the send_email
 * binding and delivers. E = never: a mail failure never reaches the caller.
 */
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { environment } from "./environment.ts";

export const emailSender = Effect.gen(function* () {
  const env = yield* environment;
  if (env !== "prod") {
    return {
      mode: "captured" as const,
      send: (message: { to: string; subject: string; text?: string; html?: string }) =>
        Effect.log(`[temp/email] captured (${env}) to=${message.to} subject=${message.subject} text=${message.text ?? ""}`).pipe(Effect.asVoid),
    };
  }
  const sender = yield* Cloudflare.Email.SendEmail("Email");
  const email = yield* Cloudflare.Email.Send(sender);
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

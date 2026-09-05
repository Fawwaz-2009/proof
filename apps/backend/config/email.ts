import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { environment } from "./environment.ts";

// Declared outside so the stack and the worker reference the same resource.
export const EmailResource = Cloudflare.Email.SendEmail("Email");

/** The from address for outgoing email; overridable via AUTH_EMAIL_FROM. */
export const emailFromConfig = Config.string("AUTH_EMAIL_FROM").pipe(Config.withDefault("Sufra <noreply@localhost>"));

export const emailSender = Effect.gen(function* () {
  const env = yield* environment;
  const from = yield* emailFromConfig.pipe(Effect.orDie);

  if (env !== "prod") {
    return {
      mode: "captured" as const,
      send: (message: { to: string; subject: string; text?: string; html?: string }) =>
        Effect.log(`[email] captured (${env}) to=${message.to} subject=${message.subject} text=${message.text ?? ""}`).pipe(Effect.asVoid),
    };
  }

  const email = yield* Cloudflare.Email.Send(EmailResource);
  return {
    mode: "sent" as const,
    send: (message: { to: string; subject: string; text?: string; html?: string }) =>
      email
        .send({
          from,
          to: message.to,
          subject: message.subject,
          ...(message.html ? { html: message.html } : { text: message.text ?? "" }),
        })
        .pipe(
          Effect.asVoid,
          Effect.catch(() => Effect.log(`[email] delivery to ${message.to} failed`).pipe(Effect.asVoid)),
          Effect.provide(Alchemy.RuntimeContext.phantom),
        ),
  };
});

/** Inferred from the constructor; consumers import this shape, never re-annotate it. */
export type EmailSender = Effect.Success<typeof emailSender>;

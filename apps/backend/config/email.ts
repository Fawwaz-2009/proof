import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { environment } from "./environment.ts";
import { Context, Layer } from "effect";

// Declared outside so the stack and the worker reference the same resource.
export const EmailResource = Cloudflare.Email.SendEmail("Email");

/**
 * The from address for outgoing email. The localhost default is load-bearing:
 * the init gen runs during `alchemy dev` synthesis (via Auth.Live) outside any
 * binding context, and capture mode never sends, so the placeholder is
 * cosmetic there. Deploys go through worker.ts, which requires the real
 * address (see the props gen).
 */
export const emailFromConfig = Config.string("AUTH_EMAIL_FROM").pipe(Config.withDefault("Proof <noreply@localhost>"));

export class Email extends Context.Service<Email>()("Email", {
  make: Effect.gen(function* () {
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
            Effect.catch((error) => Effect.log(`[email] delivery to ${message.to} failed: ${JSON.stringify(error)}`).pipe(Effect.asVoid)),
            Effect.provide(Alchemy.RuntimeContext.phantom),
          ),
    };
  }),
}) {
  static readonly Live = Layer.effect(this, this.make).pipe(Layer.provide(Cloudflare.Email.SendBinding));
}

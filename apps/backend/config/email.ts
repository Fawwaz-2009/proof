import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { environment } from "./environment.ts";
import { Context, Layer } from "effect";

/**
 * The from address for outgoing email. The localhost default is load-bearing:
 * the init gen runs during `alchemy dev` synthesis (via Auth.Live) outside any
 * binding context, and capture mode never sends, so the placeholder is
 * cosmetic there. Deploys go through worker.ts, which requires the real
 * address (see the props gen).
 */
export const emailFromConfig = Config.string("AUTH_EMAIL_FROM").pipe(Config.withDefault("App <noreply@localhost>"));

export class Email extends Context.Service<Email>()("Email", {
  make: Effect.gen(function* () {
    const env = yield* environment;
    const from = yield* emailFromConfig.pipe(Effect.orDie);

    // The send_email binding registers at PLAN time, inside the factories:
    // both must be yielded BEFORE any stage branch, or synthesis (where no
    // stage exists yet) takes the capture path, the binding never lands on
    // the deployed worker, and production reads env["Email"] as undefined.
    // The handle reads the binding lazily at send time; at plan evaluation
    // it is undefined by design and never invoked.
    const descriptor = yield* Cloudflare.Email.SendEmail("Email");
    const email = yield* Cloudflare.Email.Send(descriptor);

    if (env !== "prod") {
      return {
        mode: "captured" as const,
        send: (message: { to: string; subject: string; text?: string; html?: string }) =>
          Effect.log(`[email] captured (${env}) to=${message.to} subject=${message.subject} text=${message.text ?? ""}`).pipe(Effect.asVoid),
      };
    }

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

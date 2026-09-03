/**
 * Temp validation Worker: environment primitive, email service, auth service —
 * plain effects, no tags, no factories. Overseer assembly: bare class, make(),
 * provides at the layer. Routes exist only to exercise the services.
 */
import * as Cloudflare from "alchemy/Cloudflare";
import { ALCHEMY_DEV } from "alchemy/Phase";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Etag from "effect/unstable/http/Etag";
import * as HttpPlatform from "effect/unstable/http/HttpPlatform";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import { auth } from "./auth.ts";
import { emailSender } from "./email.ts";
import { environment } from "./environment.ts";
import { SendEmailResponse, TempApi } from "./contract.ts";

export default class Temp extends Cloudflare.Worker<Temp>()(
  "Temp",
  // The props read the ambient stage at synthesis; the deployed Worker
  // re-evaluates them without infrastructure context, where the
  // production-shaped fallback keeps the object total and unused.
  Effect.gen(function* () {
    const isDev = yield* Effect.orDie(ALCHEMY_DEV);
    return {
      main: import.meta.filename,
      compatibility: { date: "2026-07-11", flags: ["nodejs_compat"] },
      ...(isDev ? { dev: { port: 23456, strictPort: true } } : {}),
    };
  }),
  Effect.gen(function* () {
    const email = yield* emailSender;
    const authInstance = yield* auth;
    const TempHandlersLive = HttpApiBuilder.group(TempApi, "temp", (handlers) =>
      Effect.gen(function* () {
        return handlers.handleAll({
          getEnvironment: () => Effect.map(environment, (env) => ({ environment: env })),
          sendEmail: ({ payload }) =>
            Effect.map(email.send({ to: payload.to, subject: payload.subject, text: payload.text }), () => new SendEmailResponse({ status: email.mode })),
        });
      }),
    );
    const ApiRoutesLive = HttpApiBuilder.layer(TempApi);
    const AuthRoutesLive = HttpRouter.addAll([HttpRouter.route("*", "/api/auth/*", authInstance.fetch)]);

    return {
      fetch: yield* HttpRouter.toHttpEffect(
        Layer.mergeAll(ApiRoutesLive, AuthRoutesLive).pipe(Layer.provide(TempHandlersLive), Layer.provide(HttpPlatform.layer), Layer.provide(Etag.layer)),
      ),
    };
  }).pipe(Effect.provide(Cloudflare.Email.SendBinding)),
) {}

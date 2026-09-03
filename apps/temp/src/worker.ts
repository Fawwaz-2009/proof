/**
 * Temp validation Worker: environment primitive, email service, auth service —
 * plain effects, no tags, no factories. Overseer assembly: bare class, make(),
 * provides at the layer. Routes exist only to exercise the services.
 */
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { ALCHEMY_DEV } from "alchemy/Phase";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { Etag, HttpPlatform, HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { auth } from "./auth.ts";
import { emailSender } from "./email.ts";
import { environment } from "./environment.ts";
import { SendEmailResponse, TempApi } from "./contract.ts";

export class Temp extends Cloudflare.Worker<Temp, {}>()("Temp") {}

/** Platform services the HttpApi builder needs; a Worker has no filesystem, so it's a no-op. */
const HttpServicesLive = Layer.mergeAll(Path.layer, Etag.layerWeak, HttpPlatform.layer).pipe(
  Layer.provideMerge(FileSystem.layerNoop({})),
);

const tempLayer = Temp.make(
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
            Effect.map(
              email.send({ to: payload.to, subject: payload.subject, text: payload.text }),
              () => new SendEmailResponse({ status: email.mode }),
            ),
        });
      }),
    );

    const ApiRoutesLive = HttpApiBuilder.layer(TempApi);
    const AuthRoutesLive = HttpRouter.addAll([HttpRouter.route("*", "/api/auth/*", authInstance.fetch)]);

    return {
      fetch: yield* HttpRouter.toHttpEffect(
        Layer.mergeAll(ApiRoutesLive, AuthRoutesLive).pipe(
          Layer.provide(TempHandlersLive),
          Layer.provide(HttpServicesLive),
          Layer.provide(Alchemy.RuntimeContext.phantom),
        ),
      ),
    };
  }).pipe(Effect.provide(Cloudflare.Email.SendBinding)),
).pipe(Layer.provideMerge(Alchemy.RuntimeContext.phantom));

export default tempLayer;

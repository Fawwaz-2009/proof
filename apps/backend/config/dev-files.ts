import * as Effect from "effect/Effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import { ALCHEMY_DEV } from "alchemy/Phase";
import { Layer } from "effect";
import { Files } from "./storage.ts";

/**
 * DEV ONLY gateway builder: streams bucket objects from the dev simulator
 * binding. Presigned URLs cannot work locally: the simulator is not real
 * R2, so a SigV4 URL for the real host 404s. In dev, image views therefore
 * point at this gateway.
 *
 * Zero-arg builder Effect per the dependency conventions: yields Files from
 * the context, returns the router layer with the handle closed over (raw
 * routers wrap route requirements in `Request.From<"Requires">`, which a
 * plain tag provide cannot discharge).
 */
const devFilesRoutes = Effect.gen(function* () {
  const files = yield* Files;
  return HttpRouter.addAll([
    HttpRouter.route(
      "GET",
      "/api/dev/files/*",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const key = decodeURIComponent(
          new URL(request.url, "http://localhost").pathname.replace(/^\/api\/dev\/files\//, ""),
        );

        const object = yield* files.get(key).pipe(Effect.orDie);
        if (!object) return HttpServerResponse.empty({ status: 404 });

        const bytes = new Uint8Array(yield* object.arrayBuffer().pipe(Effect.orDie));
        return HttpServerResponse.uint8Array(bytes, {
          contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
        });
      }),
    ),
  ]);
});

/**
 * The layer the worker mounts, unconditionally: the gateway routes under
 * `alchemy dev`, `Layer.empty` everywhere else. The dev decision lives here,
 * next to the routes it gates, not in the worker. Unauthenticated by
 * design: localhost only, unguessable keys.
 */
export const DevRoutesLive = Layer.unwrap(
  Effect.gen(function* () {
    const isDev = yield* Effect.orDie(ALCHEMY_DEV);
    if (!isDev) return Layer.empty;
    return yield* Effect.provide(devFilesRoutes, Files.Live);
  }),
);

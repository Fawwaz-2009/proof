import * as Cloudflare from "alchemy/Cloudflare";
import { ALCHEMY_DEV } from "alchemy/Phase";
import * as Effect from "effect/Effect";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

export default class Temp extends Cloudflare.Worker<Temp>()(
  "Temp",
  Effect.gen(function* () {
    const isDev = yield* Effect.orDie(ALCHEMY_DEV);
    return {
      main: import.meta.filename,
      compatibility: { date: "2026-07-11", flags: ["nodejs_compat"] },
      ...(isDev ? { dev: { port: 23456, strictPort: true } } : {}),
    };
  }),
  Effect.gen(function* () {
    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        return HttpServerResponse.text(`temp is alive — ${request.url}`);
      }),
    };
  }),
) {}

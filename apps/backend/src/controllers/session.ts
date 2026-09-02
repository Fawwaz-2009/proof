import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { AppApi, SessionResponse } from "../contracts/index.ts";
import { Authentication } from "../middlewares/authentication.ts";

export const SessionHandlersLive = HttpApiBuilder.group(AppApi, "session", (handlers) =>
  Effect.gen(function* () {
    const authentication = yield* Authentication;

    return handlers.handle("getSession", ({ request }) => authentication.getUser(new Headers(request.headers)).pipe(Effect.map((user) => new SessionResponse({ user }))));
  }),
);

import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { AppApi, SessionResponse } from "../contracts/index.ts";
import type { GetUser } from "../middlewares/authentication.ts";

export const SessionHandlersLive = (getUser: GetUser) =>
  HttpApiBuilder.group(AppApi, "session", (handlers) =>
    Effect.gen(function* () {
      return handlers.handle("getSession", ({ request }) => getUser(new Headers(request.headers)).pipe(Effect.map((user) => new SessionResponse({ user }))));
    }),
  );

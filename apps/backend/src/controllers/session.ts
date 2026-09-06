import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { AppApi, SessionResponse } from "../contracts/index.ts";
import { Auth } from "../../config/auth.ts";

export const SessionHandlersLive = HttpApiBuilder.group(AppApi, "session", (handlers) =>
  Effect.gen(function* () {
    const auth = yield* Auth;

    return handlers.handle("getSession", ({ request }) =>
      auth.getSession(new Headers(request.headers)).pipe(
        Effect.orDie,
        Effect.map((session) => new SessionResponse({ user: session?.user ?? null })),
      ),
    );
  }),
);

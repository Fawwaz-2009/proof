import type * as Alchemy from "alchemy";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import { AppApi, Authenticated, CurrentUser, SessionResponse, SessionUser, Unauthorized } from "../contracts/index.ts";

/** Identity-only bridge from Better Auth's session into the Effect world. */
export class Authentication extends Context.Service<
  Authentication,
  {
    readonly getUser: (headers: Headers) => Effect.Effect<SessionUser | null, never, Alchemy.RuntimeContext>;
  }
>()("AppApi/Authentication") {}

export const AuthenticatedLive = Layer.effect(
  Authenticated,
  Effect.gen(function* () {
    const authentication = yield* Authentication;

    return (httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const user = yield* authentication.getUser(new Headers(request.headers));

        if (!user) {
          return yield* new Unauthorized({
            message: "Authentication required",
          });
        }

        return yield* Effect.provideService(httpEffect, CurrentUser, user);
      });
  }),
);

export const SessionHandlersLive = HttpApiBuilder.group(AppApi, "session", (handlers) =>
  Effect.gen(function* () {
    const authentication = yield* Authentication;

    return handlers.handle("getSession", ({ request }) => authentication.getUser(new Headers(request.headers)).pipe(Effect.map((user) => new SessionResponse({ user }))));
  }),
);

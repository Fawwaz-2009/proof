import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import { Auth } from "../../config/auth.ts";
import { Authenticated, CurrentUser, SessionUser, Unauthorized } from "../contracts/auth.ts";

/**
 * The authentication middleware: resolves the Better Auth session per
 * request and provides `CurrentUser` for the rest of the request, or fails
 * 401. Consumes the `Auth` service (provided by `Auth.Live`) and, per call,
 * the request's RuntimeContext, which the contract declares via `requires`.
 */
export const AuthenticatedLive = Layer.effect(
  Authenticated,
  Effect.gen(function* () {
    const auth = yield* Auth;

    return (httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const session = yield* auth.getSession(new Headers(request.headers)).pipe(Effect.orDie);

        if (!session?.user) {
          return yield* new Unauthorized({
            message: "Authentication required",
          });
        }

        const user: SessionUser = {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name || session.user.email,
        };

        return yield* Effect.provideService(httpEffect, CurrentUser, user);
      });
  }),
);

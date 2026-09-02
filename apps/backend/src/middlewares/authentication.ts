import type * as Alchemy from "alchemy";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import { Authenticated, CurrentUser, SessionUser, Unauthorized } from "../contracts/auth.ts";

/**
 * The authentication middleware — one file per middleware: the service tag
 * (the Better Auth session bridge), the runtime value provided by the entry,
 * and the middleware layer. The declaration (`Authenticated`) lives in the
 * contract; everything that needs a running server lives here.
 */

/** The getUser closure the Worker builds from its Better Auth instance. */
export type GetUser = (headers: Headers) => Effect.Effect<SessionUser | null, never, Alchemy.RuntimeContext>;

/** Identity-only bridge from Better Auth's session into the Effect world. */
export class Authentication extends Context.Service<
  Authentication,
  {
    readonly getUser: GetUser;
  }
>()("AppApi/Authentication") {}

/** Middleware layer: resolves the session, provides CurrentUser, or fails 401. */
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

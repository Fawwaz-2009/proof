import type * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import { Authenticated, CurrentUser, SessionUser, Unauthorized } from "../contracts/auth.ts";

/**
 * The authentication middleware — one file per middleware (tag-free): the
 * runtime dependency is injected as a plain closure, the declaration
 * (`Authenticated`) lives in the contract.
 */

/** The session bridge the Worker builds from its Better Auth instance. */
export type GetUser = (headers: Headers) => Effect.Effect<SessionUser | null, never, Alchemy.RuntimeContext>;

/** Middleware layer: resolves the session, provides CurrentUser, or fails 401. */
export const AuthenticatedLive = (getUser: GetUser) =>
  Layer.effect(
    Authenticated,
    Effect.gen(function* () {
      return (httpEffect) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest;
          const user = yield* getUser(new Headers(request.headers));

          if (!user) {
            return yield* new Unauthorized({
              message: "Authentication required",
            });
          }

          return yield* Effect.provideService(httpEffect, CurrentUser, user);
        });
    }),
  );

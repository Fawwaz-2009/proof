import * as Alchemy from "alchemy";
import type { BetterAuthInstance, BetterAuthProps } from "@alchemy.run/better-auth";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { Etag, HttpPlatform, HttpRouter } from "effect/unstable/http";
import { AppApiLive, Authentication, DevelopmentApiLive, developmentMailboxLive } from "../src/controllers/index.ts";
import type { DomainDb } from "../src/database.ts";
import { notesLive } from "../src/domain/notes/index.ts";
import { r2Port, type BackendEnvironment } from "../src/lib/bindings.ts";

/**
 * The route table — the `config/routes.rb` analogue: the one place that says
 * what is mounted on the Backend Worker. Assembles the HTTP surface from the
 * api layers plus the runtime handles; adding a resource means adding its
 * layer here. Pure composition over the passed-in handles — no Alchemy
 * resources are created.
 */
export type RouteDependencies = {
  /** The Better Auth instance: its fetch handler is mounted under /api/auth. */
  readonly auth: BetterAuthInstance<BetterAuthProps>;
  readonly db: DomainDb;
  readonly environment: BackendEnvironment;
  readonly canAccessDevMailbox: (url: string) => boolean;
};

export const assembleRoutes = ({ auth, db, environment, canAccessDevMailbox }: RouteDependencies) =>
  Effect.gen(function* () {
    const AuthenticationLive = Layer.succeed(Authentication)({
      getUser: (headers) =>
        auth.getSession(headers).pipe(
          Effect.orDie,
          Effect.map((session) =>
            session?.user
              ? {
                  id: session.user.id,
                  email: session.user.email,
                  name: session.user.name || session.user.email,
                }
              : null,
          ),
        ),
    });
    const AppRoutesLive = AppApiLive.pipe(Layer.provide(notesLive(db, r2Port(environment.FILES))), Layer.provide(AuthenticationLive));
    const AuthRoutesLive = HttpRouter.addAll([HttpRouter.route("*", "/api/auth/*", auth.fetch)]);
    const DevelopmentRoutesLive = DevelopmentApiLive.pipe(Layer.provide(developmentMailboxLive(db, canAccessDevMailbox)));
    const RoutesLive = Layer.mergeAll(AppRoutesLive, AuthRoutesLive, DevelopmentRoutesLive);
    const HttpServicesLive = Layer.mergeAll(Path.layer, Etag.layerWeak, HttpPlatform.layer).pipe(Layer.provideMerge(FileSystem.layerNoop({})));
    const fetch = yield* HttpRouter.toHttpEffect(RoutesLive.pipe(Layer.provide(HttpServicesLive), Layer.provide(Alchemy.RuntimeContext.phantom)));
    return { fetch };
  });

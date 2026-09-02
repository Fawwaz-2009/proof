import * as Alchemy from "alchemy";
import { HttpRouter } from "effect/unstable/http";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import { Etag, HttpPlatform } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import type { BetterAuthInstance, BetterAuthProps } from "@alchemy.run/better-auth";
import { AppApi, DevelopmentApi } from "../src/contracts/index.ts";
import { SessionHandlersLive } from "../src/controllers/session.ts";
import { NotesHandlersLive } from "../src/controllers/notes.ts";
import { DevMailboxHandlersLive, developmentMailboxLive } from "../src/controllers/dev-mailbox.ts";
import { AuthenticatedLive, type GetUser } from "../src/middlewares/authentication.ts";
import type { DomainDb } from "../src/database.ts";
import { notesLive } from "../src/domain/notes/index.ts";
import { r2Port, type BackendEnvironment } from "../src/lib/bindings.ts";

/**
 * The route table — the `config/routes.rb` analogue: a flat manifest of every
 * surface mounted on the Backend Worker. Pure composition over the passed-in
 * runtime handles; no Alchemy resources are created here.
 */

/** Platform services the HttpApi builder needs; a Worker has no filesystem, so it's a no-op. */
const HttpServicesLive = Layer.mergeAll(Path.layer, Etag.layerWeak, HttpPlatform.layer).pipe(Layer.provideMerge(FileSystem.layerNoop({})));

export type RouteDependencies = {
  /** The Better Auth instance: its fetch handler is mounted under /api/auth. */
  readonly auth: BetterAuthInstance<BetterAuthProps>;
  /** The session bridge the Worker builds from its Better Auth instance. */
  readonly authentication: GetUser;
  readonly db: DomainDb;
  readonly environment: BackendEnvironment;
  readonly canAccessDevMailbox: (url: string) => boolean;
};

export const assembleRoutes = ({ auth, authentication, db, environment, canAccessDevMailbox }: RouteDependencies) =>
  Effect.gen(function* () {
    // Product surface: Session + Notes groups behind the authentication middleware.
    const AppRoutesLive = HttpApiBuilder.layer(AppApi).pipe(
      Layer.provide(Layer.mergeAll(SessionHandlersLive(authentication), NotesHandlersLive)),
      Layer.provide(notesLive(db, r2Port(environment.FILES))),
      Layer.provide(AuthenticatedLive(authentication)),
    );

    // Better Auth: its own framework, mounted as a raw catch-all before the typed API.
    const AuthRoutesLive = HttpRouter.addAll([HttpRouter.route("*", "/api/auth/*", auth.fetch)]);

    // Development surface: mailbox read — no auth middleware by design, 404-cloaked.
    const DevelopmentRoutesLive = HttpApiBuilder.layer(DevelopmentApi).pipe(
      Layer.provide(DevMailboxHandlersLive),
      Layer.provide(developmentMailboxLive(db, canAccessDevMailbox)),
    );

    return {
      fetch: yield* HttpRouter.toHttpEffect(
        Layer.mergeAll(AppRoutesLive, AuthRoutesLive, DevelopmentRoutesLive).pipe(Layer.provide(HttpServicesLive), Layer.provide(Alchemy.RuntimeContext.phantom)),
      ),
    };
  });

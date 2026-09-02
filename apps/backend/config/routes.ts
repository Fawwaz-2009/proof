import * as Alchemy from "alchemy";
import type { BetterAuthInstance, BetterAuthProps } from "@alchemy.run/better-auth";
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { Etag, HttpPlatform } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { AppApi, DevelopmentApi } from "../src/contracts/index.ts";
import { SessionHandlersLive } from "../src/controllers/session.ts";
import { NotesHandlersLive } from "../src/controllers/notes.ts";
import { DevMailboxHandlersLive, DevelopmentMailbox } from "../src/controllers/dev-mailbox.ts";
import { Authentication, AuthenticatedLive, type GetUser } from "../src/middlewares/authentication.ts";
import { Database, type DomainDb } from "./database.ts";
import { NotesLive } from "../src/domain/notes/index.ts";
import { BucketPort, r2Port, type BackendEnvironment } from "./bindings.ts";

/**
 * The route table — the `config/routes.rb` analogue: a flat manifest of every
 * surface mounted on the Backend Worker, and every implementation provided by
 * Tag + Layer. Pure composition over the runtime handles passed in by the
 * entry; no factories, no Alchemy resources created here.
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
    const AppRoutesLive = HttpApiBuilder.layer(AppApi);
    // Better Auth: its own framework, mounted as a raw catch-all before the typed API.
    const AuthRoutesLive = HttpRouter.addAll([HttpRouter.route("*", "/api/auth/*", auth.fetch)]);
    // Development surface: mailbox read — no auth middleware by design, 404-cloaked.
    const DevelopmentRoutesLive = HttpApiBuilder.layer(DevelopmentApi);

    return {
      fetch: yield* HttpRouter.toHttpEffect(
        Layer.mergeAll(AppRoutesLive, AuthRoutesLive, DevelopmentRoutesLive).pipe(
          Layer.provide(Layer.mergeAll(SessionHandlersLive, NotesHandlersLive)),
          Layer.provide(DevMailboxHandlersLive),
          Layer.provide(NotesLive),
          Layer.provide(AuthenticatedLive),
          Layer.provide(Layer.succeed(Authentication, { getUser: authentication })),
          Layer.provide(Layer.mergeAll(Layer.succeed(Database, { db }), Layer.succeed(BucketPort, r2Port(environment.FILES)))),
          Layer.provide(Layer.succeed(DevelopmentMailbox, { db, canAccess: canAccessDevMailbox })),
          Layer.provide(HttpServicesLive),
          Layer.provide(Alchemy.RuntimeContext.phantom),
        ),
      ),
    };
  });

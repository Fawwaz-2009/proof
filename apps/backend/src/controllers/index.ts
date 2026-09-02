import * as Layer from "effect/Layer";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { AppApi, DevelopmentApi } from "../contracts/index.ts";
import { AuthenticatedLive, SessionHandlersLive } from "./auth.ts";
import { DevMailboxHandlersLive } from "./dev-mailbox.ts";
import { NotesHandlersLive } from "./notes.ts";

const AppApiHandlersLive = Layer.mergeAll(SessionHandlersLive, NotesHandlersLive);

export const AppApiLive = HttpApiBuilder.layer(AppApi).pipe(Layer.provide(AppApiHandlersLive), Layer.provide(AuthenticatedLive));
export const DevelopmentApiLive = HttpApiBuilder.layer(DevelopmentApi).pipe(Layer.provide(DevMailboxHandlersLive));

export { Authentication } from "./auth.ts";
export { developmentMailboxLive, isDevMailboxUrl } from "./dev-mailbox.ts";

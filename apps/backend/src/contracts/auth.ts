import type * as Alchemy from "alchemy";
import * as Context from "effect/Context";
import * as Schema from "effect/Schema";
import { HttpApiMiddleware } from "effect/unstable/httpapi";

export class SessionUser extends Schema.Class<SessionUser>("SessionUser")({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
}) {}

export class CurrentUser extends Context.Service<CurrentUser, SessionUser>()("AppApi/CurrentUser") {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", { message: Schema.String }, { httpApiStatus: 401 }) {}

export class Authenticated extends HttpApiMiddleware.Service<Authenticated, { provides: CurrentUser; requires: Alchemy.RuntimeContext }>()("AppApi/Authenticated", {
  error: Unauthorized,
}) {}

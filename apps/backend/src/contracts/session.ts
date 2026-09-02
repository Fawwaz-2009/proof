import * as Schema from "effect/Schema";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { SessionUser } from "./auth.ts";

export class SessionResponse extends Schema.Class<SessionResponse>("SessionResponse")({
  user: Schema.NullOr(SessionUser),
}) {}

export const GetSession = HttpApiEndpoint.get("getSession", "/session", { success: SessionResponse });

export class SessionApi extends HttpApiGroup.make("session").add(GetSession) {}

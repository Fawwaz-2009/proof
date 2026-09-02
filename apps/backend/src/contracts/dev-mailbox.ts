import * as Schema from "effect/Schema";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

export const DevMailboxResponse = Schema.Struct({
  code: Schema.String,
});
export type DevMailboxResponse = typeof DevMailboxResponse.Type;

export class DevMailboxNotFound extends Schema.TaggedError<DevMailboxNotFound>()("DevMailboxNotFound", { message: Schema.String }, { httpApiStatus: 404 }) {}

export const GetDevMailbox = HttpApiEndpoint.get("getDevMailbox", "/dev/mailbox", {
  query: { email: Schema.String },
  success: DevMailboxResponse,
  error: DevMailboxNotFound,
});

export class DevMailboxApi extends HttpApiGroup.make("devMailbox").add(GetDevMailbox) {}

import { eq } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { DevelopmentApi, DevMailboxNotFound, DevMailboxResponse } from "../contracts/index.ts";
import { DevMailbox } from "../db/d1.ts";
import type { DomainDb } from "../database.ts";

// The host rule for OTP-related development access lives in the auth config
// (config/auth.config.ts) — the OTP send path and this route must agree on it.
export { isDevMailboxUrl } from "../../config/auth.config.ts";
import { isDevMailboxUrl } from "../../config/auth.config.ts";

export class DevelopmentMailbox extends Context.Service<
  DevelopmentMailbox,
  {
    readonly db: DomainDb;
    readonly canAccess: (url: string) => boolean;
  }
>()("AppApi/DevelopmentMailbox") {}

export const developmentMailboxLive = (db: DomainDb, canAccess: (url: string) => boolean = isDevMailboxUrl) => Layer.succeed(DevelopmentMailbox)({ db, canAccess });

export const DevMailboxHandlersLive = HttpApiBuilder.group(DevelopmentApi, "devMailbox", (handlers) =>
  Effect.gen(function* () {
    const mailbox = yield* DevelopmentMailbox;
    return handlers.handle("getDevMailbox", ({ query, request }) => {
      // A disallowed host reads the same 404 as a missing code: the mailbox's
      // existence is not disclosed outside development hosts.
      if (!mailbox.canAccess(request.originalUrl)) {
        return new DevMailboxNotFound({ message: "Not found" });
      }

      return mailbox.db
        .select({ code: DevMailbox.code })
        .from(DevMailbox)
        .where(eq(DevMailbox.email, query.email.trim().toLowerCase()))
        .limit(1)
        .pipe(
          Effect.orDie,
          Effect.flatMap(([message]) => (message ? Effect.succeed(DevMailboxResponse.make(message)) : new DevMailboxNotFound({ message: "No code found" }))),
        );
    });
  }),
);

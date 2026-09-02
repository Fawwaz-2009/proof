import { eq } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { DevelopmentApi, DevMailboxNotFound, DevMailboxResponse } from "../contracts/index.ts";
import { DevMailbox } from "../db/d1.ts";
import type { DomainDb } from "../database.ts";

/**
 * Host rule for reading captured OTP codes. `http://localhost` always
 * qualifies; deployed non-prod stages add `*.workers.dev` through the
 * `DEV_MAILBOX_ALLOWED_HOSTS` env, production ships an empty list.
 */
export const isDevMailboxUrl = (value: string, allowedHosts: ReadonlyArray<string> = []): boolean => {
  try {
    const { host, hostname, protocol } = new URL(value);
    const matchesAllowedHost = allowedHosts.some((allowedHost) => {
      const normalized = allowedHost.trim().toLowerCase();
      if (normalized.startsWith("*.")) {
        const suffix = normalized.slice(1);
        return hostname.endsWith(suffix) && hostname.length > suffix.length;
      }
      return normalized === host;
    });
    return (
      (protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost"))) ||
      ((protocol === "http:" || protocol === "https:") && matchesAllowedHost)
    );
  } catch {
    return false;
  }
};

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

/**
 * The stack's resources resolved for runtime use, as one merged layer: the
 * D1 drizzle handle, the R2 bucket client, and email delivery, together with
 * the framework binding layers that serve them. Provided at the discharge
 * edge after the services that consume them.
 */
import * as Cloudflare from "alchemy/Cloudflare";
import * as Layer from "effect/Layer";
import { DatabaseLive } from "./database.ts";
import { FilesLive } from "./storage.ts";

export const ResourcesLive = Layer.mergeAll(
  DatabaseLive,
  FilesLive,
  Cloudflare.D1.QueryDatabaseBinding,
  Cloudflare.R2.ReadWriteBucketBinding,
  Cloudflare.Email.SendBinding,
);

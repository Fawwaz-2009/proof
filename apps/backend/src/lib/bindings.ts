import type * as Cloudflare from "@cloudflare/workers-types";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import type { BackendEnvironmentSwitches } from "../../config/environments.ts";

/**
 * Domain-blind plumbing between the Worker's runtime bindings and the
 * backend's services. No domain nouns; byte-identical in every app on this
 * backbone.
 */

/** The runtime view of the Worker's env: bindings plus the env switches. */
export type BackendEnvironment = BackendEnvironmentSwitches & {
  readonly FILES: Cloudflare.R2Bucket;
  readonly [key: string]: unknown;
};

/** The bucket port over the Worker's native R2 binding; rejections surface as defects at the call site. */
export const r2Port = (bucket: Cloudflare.R2Bucket) => ({
  putObject: (key: string, bytes: Uint8Array, contentType: string, name: string) =>
    Effect.promise(async () => {
      await bucket.put(key, bytes, { httpMetadata: { contentType }, customMetadata: { name } });
    }),
  deleteObject: (key: string) =>
    Effect.promise(async () => {
      await bucket.delete(key);
    }),
  getObject: (key: string) =>
    Effect.promise(async () => {
      const object = await bucket.get(key);
      if (!object) return null;
      const bytes = new Uint8Array(await object.arrayBuffer());
      return { bytes, contentType: object.httpMetadata?.contentType ?? "" };
    }),
});

/** The R2 bucket port, resolved from the Worker binding in the entry. */
export type BucketPortService = {
  readonly putObject: (key: string, bytes: Uint8Array, contentType: string, name: string) => Effect.Effect<void>;
  readonly deleteObject: (key: string) => Effect.Effect<void>;
  readonly getObject: (key: string) => Effect.Effect<{ bytes: Uint8Array; contentType: string } | null>;
};

/** The R2 bucket port, resolved from the Worker binding in the entry. */
export class BucketPort extends Context.Service<BucketPort, BucketPortService>()("Backend/BucketPort") {}

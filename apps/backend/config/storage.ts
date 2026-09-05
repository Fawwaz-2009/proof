import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Context, Effect, Layer } from "effect";

/** Attachment objects for the notes demo. Private: every read is authorized by the note's owner. */
export const FilesBucket = Cloudflare.R2.Bucket("Files");

/**
 * The bucket surface the app uses. The binding client's interface declares
 * RuntimeContext on every method (shared with the HTTP and dev-gateway
 * implementations, which resolve credentials through the ambient context per
 * call); the worker-binding implementation reads it only optionally, so
 * RuntimeContext.phantom (Layer.empty) closes the requirement in the type
 * while runtime behavior is unchanged.
 */
const makeFiles = Effect.gen(function* () {
  const files = yield* Cloudflare.R2.ReadWriteBucket(FilesBucket);
  return {
    get: (key: string) => files.get(key).pipe(Effect.provide(Alchemy.RuntimeContext.phantom)),
    put: (
      key: string,
      value: Uint8Array,
      options?: { httpMetadata?: { contentType: string }; customMetadata?: Record<string, string> },
    ) => files.put(key, value, options).pipe(Effect.provide(Alchemy.RuntimeContext.phantom)),
    delete: (keys: string | string[]) => files.delete(keys).pipe(Effect.provide(Alchemy.RuntimeContext.phantom)),
  };
});

/** The files shape, inferred from the constructor; consumers import this shape, never re-annotate it. */
export type FilesShape = Effect.Success<typeof makeFiles>;

/**
 * The files service. Consumers yield the tag; the client behind it abstracts
 * the resource, so application code never depends on infra resource types.
 */
export class Files extends Context.Service<Files, FilesShape>()("@sufra/Files") {}

/**
 * Resolved once per isolate at worker init. ReadWriteBucketBinding registers
 * the binding at plan evaluation and reads it from the environment at
 * runtime, so nothing plan-time leaks into the per-request R channel.
 */
export const FilesLive = Layer.effect(Files, makeFiles).pipe(Layer.provide(Cloudflare.R2.ReadWriteBucketBinding));

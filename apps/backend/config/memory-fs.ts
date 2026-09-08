import { Effect } from "effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Sink from "effect/Sink";

/**
 * In-memory FileSystem for the worker. Workerd has no writable disk, but
 * buffered multipart persistence and domain file reads need one. Files live
 * in a module-scoped Map and are dropped when their scoped temp directory's
 * release runs at request settle, so nothing accumulates across requests.
 *
 * Memory math: concurrent in-flight uploads x maxPartSize must stay well
 * under the 128MB isolate limit. The multipart parser enforces maxPartSize
 * mid-stream, so a single request can never exceed it. If the app ever
 * needs bigger files, switch the contract payload to
 * HttpApiSchema.asMultipartStream (constant memory, manual part handling).
 */
const store = new Map<string, Uint8Array>();
const dirs = new Set<string>();

function concatBytes(chunks: ReadonlyArray<Uint8Array>): Uint8Array {
  const total = chunks.reduce((n, chunk) => n + chunk.byteLength, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Test/observability hook: current in-memory footprint. */
export const stats = (): { files: number; bytes: number } => ({
  files: store.size,
  bytes: [...store.values()].reduce((n, b) => n + b.byteLength, 0),
});

export const MemoryFsLive = Layer.succeed(
  FileSystem.FileSystem,
  FileSystem.makeNoop({
    makeTempDirectoryScoped: () =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const dir = `/tmp/${crypto.randomUUID()}`;
          dirs.add(dir);
          return dir;
        }),
        (dir) =>
          Effect.sync(() => {
            for (const path of store.keys()) {
              if (path.startsWith(`${dir}/`)) store.delete(path);
            }
            dirs.delete(dir);
          }),
      ),
    sink: (path: string) =>
      Sink.map(Sink.collect<Uint8Array>(), (chunks) => {
        store.set(path, concatBytes(chunks));
      }),
    writeFile: (path: string, data: Uint8Array) => Effect.sync(() => void store.set(path, data)),
    readFile: (path: string) =>
      Effect.sync(() => {
        const bytes = store.get(path);
        if (!bytes) throw new Error(`NoSuchFile: ${path}`);
        return bytes;
      }),
    remove: (path: string) => Effect.sync(() => void store.delete(path)),
  }),
);

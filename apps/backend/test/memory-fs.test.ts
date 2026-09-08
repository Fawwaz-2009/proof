import { describe, expect, test } from "bun:test";
import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import { MemoryFsLive, stats } from "../config/memory-fs.ts";

/**
 * Concurrency and cleanup guarantees of the in-memory filesystem: every
 * request-scoped temp directory is released when its scope settles, and
 * nothing accumulates across waves of concurrent requests.
 *
 * Memory budget (see AGENTS.md): concurrent in-flight uploads x maxFileSize
 * must stay well under the 128MB worker isolate limit. These tests use 1MB
 * files x 16 concurrent requests = 16MB worst case per wave.
 */

const FileSize = 1024 * 1024; // 1MB

const uploadEffect = (n: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const path = `${dir}/upload-${n}.bin`;
    yield* fs.writeFile(path, new Uint8Array(FileSize));
    const bytes = yield* fs.readFile(path);
    return { path, size: bytes.byteLength };
  }).pipe(Effect.scoped, Effect.provide(MemoryFsLive));

describe("memory filesystem", () => {
  test("concurrent requests persist and read back their own bytes", async () => {
    const results = await Effect.runPromise(
      Effect.all(
        Array.from({ length: 16 }, (_, i) => uploadEffect(i + 1)),
        { concurrency: "unbounded" },
      ),
    );

    expect(results).toHaveLength(16);
    for (const result of results) expect(result.size).toBe(FileSize);
  });

  test("released scopes drop their bytes: no accumulation across waves", async () => {
    for (let wave = 1; wave <= 3; wave++) {
      await Effect.runPromise(
        Effect.all(
          Array.from({ length: 16 }, (_, i) => uploadEffect(wave * 100 + i)),
          { concurrency: "unbounded" },
        ),
      );
      expect(stats()).toEqual({ files: 0, bytes: 0 });
    }
  });
});

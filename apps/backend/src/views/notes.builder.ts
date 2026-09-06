import * as Effect from "effect/Effect";
import { Files } from "../../config/storage.ts";
import { NoteView } from "./notes.schema.ts";
import type { Note } from "../../config/database/schema.ts";

/**
 * The view builder as an effect: yields `Files` once and returns the per-row
 * builder function. Runs at the build phase (domain `make`), so `Files` is a
 * build-phase requirement, discharged at the composition edge. Only rows the
 * domain has authorized are ever handed to this builder.
 */
export const buildNoteView = Effect.gen(function* () {
  const files = yield* Files;

  return (row: typeof Note.$inferSelect) =>
    Effect.gen(function* () {
      const imageUrl = row.imageKey ? yield* files.signReadUrl(row.imageKey) : null;
      return new NoteView({
        id: row.id,
        title: row.title,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        imageUrl,
      });
    });
});

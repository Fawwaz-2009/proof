import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { CurrentUser, NoteNotFound } from "../../contracts/index.ts";
import type { DomainDb } from "../../../config/database.ts";
import { Note } from "../../db/d1.ts";
import { renderNote } from "./render.ts";

/** Destroys the owned row and best-effort removes its attachment object; cleanup failure never fails the delete. */
export const destroyNote = (db: DomainDb, deleteObject: (key: string) => Effect.Effect<void>, id: string) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const rows = yield* db
      .delete(Note)
      .where(and(eq(Note.id, id), eq(Note.userId, user.id)))
      .returning()
      .pipe(Effect.orDie);
    const row = rows[0];
    if (!row) return yield* new NoteNotFound({ message: "Note not found", id });
    if (row.attachmentKey) yield* deleteObject(row.attachmentKey).pipe(Effect.ignore);
    return renderNote(row);
  });

import { desc, eq } from "drizzle-orm";
import { Effect } from "effect";
import { CurrentUser } from "../../contracts/index.ts";
import type { DomainDb } from "../../database.ts";
import { Note } from "../../db/d1.ts";
import { renderNote } from "./render.ts";

export const listNotes = (db: DomainDb) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const rows = yield* db.select().from(Note).where(eq(Note.userId, user.id)).orderBy(desc(Note.createdAt)).pipe(Effect.orDie);
    return { notes: rows.map(renderNote) };
  });

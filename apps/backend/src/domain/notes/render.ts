import { and, eq } from "drizzle-orm";
import type { DomainDb } from "../../../config/database.ts";
import { Note } from "../../db/d1.ts";
import { NoteView } from "../../views/notes.ts";

/** The note's wire view is rendered by the aggregate; private until a second consumer earns extraction. */
export const renderNote = (row: typeof Note.$inferSelect): NoteView =>
  new NoteView({
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    hasAttachment: row.attachmentKey !== null,
    attachmentName: row.attachmentName,
  });

export type NoteRow = typeof Note.$inferSelect;

/** Every note read and write composes this ownership predicate; ownership misses surface as a uniform 404. */
export const findOwnedNote = (db: DomainDb, userId: string, id: string) =>
  db
    .select()
    .from(Note)
    .where(and(eq(Note.id, id), eq(Note.userId, userId)))
    .limit(1);

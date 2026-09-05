import * as Schema from "effect/Schema";

/**
 * The wire view of a note. Plain JSON: `.Type` === `.Encoded`, so the browser
 * and any native client consume it without an encode step.
 */
export class NoteView extends Schema.Class<NoteView>("NoteView")({
  id: Schema.String,
  title: Schema.String,
  body: Schema.String,
  /** ISO-8601 timestamp. */
  createdAt: Schema.String,
  hasAttachment: Schema.Boolean,
  attachmentName: Schema.NullOr(Schema.String),
}) {}

import type { Note } from "../schema.ts";

/** The note's wire view is rendered by the domain; private until a second consumer earns extraction. */
export const renderNote = (row: typeof Note.$inferSelect): NoteView =>
  new NoteView({
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    hasAttachment: row.attachmentKey !== null,
    attachmentName: row.attachmentName,
  });

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

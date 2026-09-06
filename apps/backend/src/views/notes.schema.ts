import * as Schema from "effect/Schema";

/**
 * The wire view of a note. Plain JSON: `.Type` === `.Encoded`, so the browser
 * and any native client consume it without an encode step. The image is
 * exposed as a ready-to-use presigned R2 GET URL (time-boxed), constructed by
 * the per-row builder (see notes.builder.ts): the browser loads it directly
 * from storage, no round-trip through the API. Authorization has already
 * happened in the domain — only rows the caller owns are ever handed to this
 * factory.
 */
export class NoteView extends Schema.Class<NoteView>("NoteView")({
  id: Schema.String,
  title: Schema.String,
  body: Schema.String,
  /** ISO-8601 timestamp. */
  createdAt: Schema.String,
  imageUrl: Schema.NullOr(Schema.String),
}) {}

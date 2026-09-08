import { Multipart } from "effect/unstable/http";
import * as Schema from "effect/Schema";
import { HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, HttpApiSchema, HttpApiError } from "effect/unstable/httpapi";
import { Authenticated } from "./auth.ts";

const NoteId = { id: Schema.String };

/**
 * The wire view of a note. Lives in the contract because the browser consumes
 * this shape; the server-side factory that builds it lives in
 * src/views/notes.builder.ts.
 */
export class NoteView extends Schema.Class<NoteView>("NoteView")({
  id: Schema.String,
  title: Schema.String,
  body: Schema.String,
  /** ISO-8601 timestamp. */
  createdAt: Schema.String,
  imageUrl: Schema.NullOr(Schema.String),
}) {}

/**
 * Images only. The multipart parser enforces the size limits natively
 * (maxFileSize per part, maxTotalSize per request) mid-stream, so an
 * oversized upload is rejected before the domain runs. The content-type
 * whitelist is enforced by the controller, surfacing the standard
 * `HttpApiError.BadRequest` (400).
 */
export const ImageContentTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

const imageContentTypeSet = new Set<string>(ImageContentTypes);
export const MaxImageBytes = 10 * 1024 * 1024;

export const ListNotesResponse = Schema.Struct({
  notes: Schema.Array(NoteView),
});
export type ListNotesResponse = typeof ListNotesResponse.Type;

export const CreateNoteInput = Schema.Struct({
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  body: Schema.String.check(Schema.isMaxLength(10_000)),
  image: Schema.optional(
    Multipart.SingleFileSchema.pipe(
      Schema.check(
        Schema.makeFilter((file) => imageContentTypeSet.has(file.contentType), {
          message: "Only PNG, JPEG, WebP, and GIF images are allowed.",
          identifier: "CreateNoteImageContentTypes",
        }),
      ),
    ),
  ),
}).pipe(HttpApiSchema.asMultipart({ maxFileSize: MaxImageBytes, maxTotalSize: MaxImageBytes }));
export type CreateNoteInput = typeof CreateNoteInput.Type;

export const ListNotes = HttpApiEndpoint.get("listNotes", "/notes", { success: ListNotesResponse });

export const CreateNote = HttpApiEndpoint.post("createNote", "/notes", { payload: CreateNoteInput, success: NoteView });

export const DestroyNote = HttpApiEndpoint.delete("destroyNote", "/notes/:id", {
  params: NoteId,
  success: NoteView,
  error: [HttpApiError.NotFound],
});

export class ValidationError extends Schema.TaggedError<ValidationError>()("ValidationError", { message: Schema.String }, { httpApiStatus: 400 }) {}

export class SchemaErrorHandler extends HttpApiMiddleware.Service<SchemaErrorHandler, { provides: ValidationError }>()("api/SchemaErrorHandler", {
  error: ValidationError,
}) {}

export class NotesApi extends HttpApiGroup.make("notes").add(ListNotes, CreateNote, DestroyNote).middleware(Authenticated).middleware(SchemaErrorHandler) {}

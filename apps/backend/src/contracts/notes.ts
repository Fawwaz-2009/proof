import * as Schema from "effect/Schema";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { NoteView } from "../views/notes.ts";
import { Authenticated } from "./auth.ts";

const NoteId = { id: Schema.String };

export class NoteNotFound extends Schema.TaggedError<NoteNotFound>()("NoteNotFound", { message: Schema.String, id: Schema.String }, { httpApiStatus: 404 }) {}

export class AttachmentTooLarge extends Schema.TaggedError<AttachmentTooLarge>()(
  "AttachmentTooLarge",
  { message: Schema.String, maxBytes: Schema.Number },
  { httpApiStatus: 400 },
) {}

/** Attachments ride the JSON contract as base64; the demo caps them well below the Workers body limit. */
export const AttachmentMaxBytes = 5 * 1024 * 1024;

export const CreateNoteInput = Schema.Struct({
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  body: Schema.String.check(Schema.isMaxLength(10_000)),
});
export type CreateNoteInput = typeof CreateNoteInput.Type;

export const AttachmentInput = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  contentType: Schema.String.check(Schema.isMaxLength(200)),
  /** Base64-encoded bytes. */
  data: Schema.String,
});
export type AttachmentInput = typeof AttachmentInput.Type;

export const AttachmentView = Schema.Struct({
  name: Schema.String,
  contentType: Schema.String,
  data: Schema.String,
  size: Schema.Number,
});
export type AttachmentView = typeof AttachmentView.Type;

export const ListNotesResponse = Schema.Struct({
  notes: Schema.Array(NoteView),
});
export type ListNotesResponse = typeof ListNotesResponse.Type;

export const ListNotes = HttpApiEndpoint.get("listNotes", "/notes", { success: ListNotesResponse });

export const CreateNote = HttpApiEndpoint.post("createNote", "/notes", { payload: CreateNoteInput, success: NoteView });

export const DestroyNote = HttpApiEndpoint.delete("destroyNote", "/notes/:id", {
  params: NoteId,
  success: NoteView,
  error: [NoteNotFound],
});

export const PutAttachment = HttpApiEndpoint.put("putAttachment", "/notes/:id/attachment", {
  params: NoteId,
  payload: AttachmentInput,
  success: NoteView,
  error: [NoteNotFound, AttachmentTooLarge],
});

export const GetAttachment = HttpApiEndpoint.get("getAttachment", "/notes/:id/attachment", {
  params: NoteId,
  success: AttachmentView,
  error: [NoteNotFound],
});

export class NotesApi extends HttpApiGroup.make("notes").add(ListNotes, CreateNote, DestroyNote, PutAttachment, GetAttachment).middleware(Authenticated) {}

import type * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import type {
  AttachmentInput,
  AttachmentTooLarge,
  AttachmentView,
  CreateNoteInput,
  CurrentUser,
  ListNotesResponse,
  NoteNotFound,
  NoteView,
} from "../../contracts/index.ts";
import type { DomainDb } from "../../database.ts";
import { createNote } from "./create.ts";
import { destroyNote } from "./destroy.ts";
import { getAttachment } from "./get-attachment.ts";
import { listNotes } from "./list.ts";
import { putAttachment } from "./put-attachment.ts";

/**
 * The notes aggregate: the only surface controllers touch. Every effect
 * requires `CurrentUser` (provided per request by the `Authenticated`
 * middleware) and scopes every query by its id, so no verb can reach another
 * user's rows.
 */
export class Notes extends Context.Service<
  Notes,
  {
    readonly list: Effect.Effect<ListNotesResponse, never, CurrentUser>;
    readonly create: (input: CreateNoteInput) => Effect.Effect<NoteView, never, CurrentUser>;
    readonly destroy: (id: string) => Effect.Effect<NoteView, NoteNotFound, CurrentUser>;
    readonly putAttachment: (id: string, input: AttachmentInput) => Effect.Effect<NoteView, NoteNotFound | AttachmentTooLarge, CurrentUser>;
    readonly getAttachment: (id: string) => Effect.Effect<AttachmentView, NoteNotFound, CurrentUser>;
  }
>()("AppApi/Notes") {}

/** The bucket port keeps R2 mechanics out of the operations; the worker binds it to the deployed bucket. */
export type BucketPort = {
  readonly putObject: (key: string, bytes: Uint8Array, contentType: string, name: string) => Effect.Effect<void>;
  readonly deleteObject: (key: string) => Effect.Effect<void>;
  readonly getObject: (key: string) => Effect.Effect<{ bytes: Uint8Array; contentType: string } | null>;
};

export const notesLive = (db: DomainDb, bucket: BucketPort) =>
  Layer.succeed(Notes)({
    list: listNotes(db),
    create: (input) => createNote(db, input),
    destroy: (id) => destroyNote(db, bucket.deleteObject, id),
    putAttachment: (id, input) => putAttachment(db, bucket.putObject, bucket.deleteObject, id, input),
    getAttachment: (id) => getAttachment(db, bucket.getObject, id),
  });

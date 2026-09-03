import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
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
import { Database } from "../../../config/database.ts";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Alchemy from "alchemy";
import { FilesBucket } from "../../../config/storage.ts";
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

/** The implementation layer: resolves the database and the R2 client from the entry's provides. */
export const NotesLive = Layer.effect(
  Notes,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const files = yield* Cloudflare.R2.ReadWriteBucket(FilesBucket);

    // The binding client's methods declare RuntimeContext in R; the Worker-binding
    // implementation reads the env directly, so the entry's phantom discharge is the
    // designed no-op that keeps the op boundary context-free.
    const putObject = (key: string, bytes: Uint8Array, contentType: string, name: string) =>
      files
        .put(key, bytes, { httpMetadata: { contentType }, customMetadata: { name } })
        .pipe(Effect.asVoid, Effect.orDie, Effect.provide(Alchemy.RuntimeContext.phantom));
    const deleteObject = (key: string) => files.delete(key).pipe(Effect.orDie, Effect.provide(Alchemy.RuntimeContext.phantom));
    const getObject = (key: string) =>
      files.get(key).pipe(
        Effect.flatMap((object) =>
          object === null
            ? Effect.succeed(null)
            : Effect.map(object.arrayBuffer(), (buffer) => ({
                bytes: new Uint8Array(buffer),
                contentType: object.httpMetadata?.contentType ?? "",
              })),
        ),
        Effect.orDie,
        Effect.provide(Alchemy.RuntimeContext.phantom),
      );

    return {
      list: listNotes(db),
      create: (input) => createNote(db, input),
      destroy: (id) => destroyNote(db, deleteObject, id),
      putAttachment: (id, input) => putAttachment(db, putObject, deleteObject, id, input),
      getAttachment: (id) => getAttachment(db, getObject, id),
    };
  }),
);

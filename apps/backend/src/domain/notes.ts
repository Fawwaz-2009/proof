/**
 * The notes domain as a service. The drizzle handle and the bucket client
 * carry no request identity, so they are resolved once at build; the methods
 * the service exposes return effects whose only requirement is the request's
 * `CurrentUser` from the authentication middleware. Signatures take inputs
 * only: no infra resource types cross this module's boundary.
 */
import { Database } from "../../config/database.ts";
import { Files } from "../../config/storage.ts";
import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { AttachmentMaxBytes, AttachmentTooLarge, CurrentUser, NoteNotFound } from "../contracts/index.ts";
import type { AttachmentInput, AttachmentView, CreateNoteInput } from "../contracts/index.ts";
import { decodeBase64, encodeBase64 } from "../lib/base64.ts";
import { Note } from "../schema.ts";
import { renderNote } from "../views/notes.ts";

const makeNotes = Effect.gen(function* () {
  const db = yield* Database;
  const files = yield* Files;

  return {
    createNote: (input: CreateNoteInput) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const rows = yield* db.insert(Note).values({ id: crypto.randomUUID(), userId: user.id, title: input.title, body: input.body }).returning().pipe(Effect.orDie);
        return renderNote(rows[0]!);
      }),

    listNotes: () =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const rows = yield* db.select().from(Note).where(eq(Note.userId, user.id)).orderBy(desc(Note.createdAt)).pipe(Effect.orDie);
        return { notes: rows.map(renderNote) };
      }),

    destroyNote: (id: string) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const rows = yield* db
          .delete(Note)
          .where(and(eq(Note.id, id), eq(Note.userId, user.id)))
          .returning()
          .pipe(Effect.orDie);
        const row = rows[0];
        if (!row) return yield* new NoteNotFound({ message: "Note not found", id });
        // Cleanup failure never fails the delete.
        if (row.attachmentKey) yield* files.delete(row.attachmentKey).pipe(Effect.ignore);
        return renderNote(row);
      }),

    putAttachment: (id: string, input: AttachmentInput) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const rows = yield* db.select().from(Note).where(eq(Note.id, id)).limit(1).pipe(Effect.orDie);
        const note = rows[0];
        if (!note || note.userId !== user.id) return yield* new NoteNotFound({ message: "Note not found", id });

        const bytes = decodeBase64(input.data);
        if (bytes.byteLength > AttachmentMaxBytes) {
          return yield* new AttachmentTooLarge({ message: "Attachment exceeds the size limit", maxBytes: AttachmentMaxBytes });
        }

        const key = `notes/${note.id}/${crypto.randomUUID()}-${input.name}`;
        yield* files.put(key, bytes, { httpMetadata: { contentType: input.contentType }, customMetadata: { name: input.name } }).pipe(Effect.asVoid, Effect.orDie);

        const updated = yield* db
          .update(Note)
          .set({ attachmentKey: key, attachmentName: input.name, attachmentType: input.contentType })
          .where(eq(Note.id, note.id))
          .returning()
          .pipe(Effect.orDie);
        const row = updated[0];
        if (!row) return yield* Effect.die("Attachment update returned no row");

        // Replacement: the superseded object is removed best-effort after the row commits.
        if (note.attachmentKey) yield* files.delete(note.attachmentKey).pipe(Effect.ignore);
        return renderNote(row);
      }),

    getAttachment: (id: string) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const rows = yield* db.select().from(Note).where(eq(Note.id, id)).limit(1).pipe(Effect.orDie);
        const note = rows[0];
        // The attachment does not exist apart from its note: an absent note, an
        // absent object, and a note without an attachment are one uniform 404.
        if (!note || note.userId !== user.id || !note.attachmentKey) {
          return yield* new NoteNotFound({ message: "Note not found", id });
        }

        const object = yield* files.get(note.attachmentKey).pipe(Effect.orDie);
        if (!object) return yield* new NoteNotFound({ message: "Note not found", id });

        const bytes = yield* object.arrayBuffer().pipe(Effect.orDie);
        const view: AttachmentView = {
          name: note.attachmentName ?? note.attachmentKey,
          contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
          data: encodeBase64(new Uint8Array(bytes)),
          size: bytes.byteLength,
        };
        return view;
      }),
  };
});

/** The notes shape, inferred from the constructor; consumers import this shape, never re-annotate it. */
export type NotesShape = Effect.Success<typeof makeNotes>;

/**
 * The notes service. Consumers yield the tag; every method returns an effect
 * whose only remaining requirement is request-scoped (`CurrentUser`).
 */
export class Notes extends Context.Service<Notes, NotesShape>()("@sufra/Notes") {}

/** Built once per isolate; its Database and Files requirements are discharged at the composition edge. */
export const NotesLive = Layer.effect(Notes, makeNotes);

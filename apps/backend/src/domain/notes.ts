/**
 * The notes domain as a service. The drizzle handle and the storage client
 * carry no request identity, so they are resolved once at build; the methods
 * the service exposes return effects whose only requirement is the request's
 * `CurrentUser` from the authentication middleware. Signatures take plain
 * inputs: the controller adapts the multipart payload into them.
 */
import { AppDatabase } from "../../config/database/index.ts";
import { Files } from "../../config/storage.ts";
import { Note } from "../../config/database/schema.ts";
import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { CurrentUser } from "../contracts/index.ts";
import { HttpApiError } from "effect/unstable/httpapi";
import { buildNoteView as makeBuildNoteView } from "../views/notes.builder.ts";

export interface CreateNoteInput {
  readonly title: string;
  readonly body: string;
  readonly image?: { readonly bytes: Uint8Array; readonly contentType: string };
}

const contentTypeByExtension: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

const extensionByContentType: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const makeNotes = Effect.gen(function* () {
  const db = yield* AppDatabase;
  const files = yield* Files;
  const buildNoteView = yield* makeBuildNoteView;

  return {
    createNote: (input: CreateNoteInput) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const id = crypto.randomUUID();

        let imageKey: string | null = null;
        if (input.image) {
          imageKey = `images/${id}/${crypto.randomUUID()}.${extensionByContentType[input.image.contentType] ?? "bin"}`;
          yield* files.put(imageKey, input.image.bytes, { httpMetadata: { contentType: input.image.contentType } }).pipe(Effect.asVoid, Effect.orDie);
        }

        const rows = yield* db.insert(Note).values({ id, userId: user.id, title: input.title, body: input.body, imageKey }).returning().pipe(Effect.orDie);
        return yield* buildNoteView(rows[0]!);
      }),

    listNotes: () =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const rows = yield* db.select().from(Note).where(eq(Note.userId, user.id)).orderBy(desc(Note.createdAt)).pipe(Effect.orDie);
        return { notes: yield* Effect.all(rows.map(buildNoteView), { concurrency: "unbounded" }) };
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
        if (!row) return yield* new HttpApiError.NotFound();
        // Cleanup failure never fails the delete.
        if (row.imageKey) yield* files.delete(row.imageKey).pipe(Effect.ignore);
        return yield* buildNoteView(row);
      }),

    /**
     * The image bytes for a note the caller owns. Authorization happens
     * here, before any byte moves: an absent note, someone else's note, and
     * a note without an image are one uniform 404.
     */
    image: (id: string) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const rows = yield* db.select().from(Note).where(eq(Note.id, id)).limit(1).pipe(Effect.orDie);
        const note = rows[0];
        if (!note || note.userId !== user.id || !note.imageKey) {
          return yield* new HttpApiError.NotFound();
        }

        const object = yield* files.get(note.imageKey).pipe(Effect.orDie);
        if (!object) return yield* new HttpApiError.NotFound();

        const buffer = yield* object.arrayBuffer().pipe(Effect.orDie);
        const extension = note.imageKey.split(".").pop() ?? "";
        return {
          bytes: new Uint8Array(buffer),
          contentType: contentTypeByExtension[extension] ?? "application/octet-stream",
        };
      }),
  };
});

/** The notes shape, inferred from the constructor; consumers import this shape, never re-annotate it. */
export type NotesShape = Effect.Success<typeof makeNotes>;

/**
 * The notes service. Consumers yield the tag; every method returns an effect
 * whose only remaining requirement is request-scoped (`CurrentUser`).
 */
export class Notes extends Context.Service<Notes, NotesShape>()("@proof/Notes") {}

/** Built once per isolate; its Database and Files requirements are discharged at the composition edge. */
export const NotesLive = Layer.effect(Notes, makeNotes);

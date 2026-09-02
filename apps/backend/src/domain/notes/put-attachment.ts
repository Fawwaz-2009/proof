import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { AttachmentMaxBytes, AttachmentTooLarge, CurrentUser, NoteNotFound } from "../../contracts/index.ts";
import type { AttachmentInput } from "../../contracts/index.ts";
import type { DomainDb } from "../../database.ts";
import { Note } from "../../db/d1.ts";
import { decodeBase64 } from "../../lib/base64.ts";
import { findOwnedNote, renderNote } from "./render.ts";

/** Fresh immutable key per object: the row, not the client, names the storage location. */
const attachmentKey = (noteId: string, name: string) => `notes/${noteId}/${crypto.randomUUID()}-${name}`;

export const putAttachment = (
  db: DomainDb,
  putObject: (key: string, bytes: Uint8Array, contentType: string, name: string) => Effect.Effect<void>,
  deleteObject: (key: string) => Effect.Effect<void>,
  id: string,
  input: AttachmentInput,
) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const rows = yield* findOwnedNote(db, user.id, id).pipe(Effect.orDie);
    const note = rows[0];
    if (!note) return yield* new NoteNotFound({ message: "Note not found", id });

    const bytes = decodeBase64(input.data);
    if (bytes.byteLength > AttachmentMaxBytes) {
      return yield* new AttachmentTooLarge({ message: "Attachment exceeds the size limit", maxBytes: AttachmentMaxBytes });
    }

    const key = attachmentKey(note.id, input.name);
    yield* putObject(key, bytes, input.contentType, input.name).pipe(Effect.orDie);

    const updated = yield* db
      .update(Note)
      .set({ attachmentKey: key, attachmentName: input.name, attachmentType: input.contentType })
      .where(eq(Note.id, note.id))
      .returning()
      .pipe(Effect.orDie);
    const row = updated[0];
    if (!row) return yield* Effect.die("Attachment update returned no row");

    // Replacement: the superseded object is removed best-effort after the row commits.
    if (note.attachmentKey) yield* deleteObject(note.attachmentKey).pipe(Effect.ignore);
    return renderNote(row);
  });

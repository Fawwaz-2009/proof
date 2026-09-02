import { Effect } from "effect";
import { CurrentUser, NoteNotFound } from "../../contracts/index.ts";
import type { AttachmentView } from "../../contracts/index.ts";
import type { DomainDb } from "../../database.ts";
import { encodeBase64 } from "../../lib/base64.ts";
import { findOwnedNote } from "./render.ts";

export const getAttachment = (db: DomainDb, getObject: (key: string) => Effect.Effect<{ bytes: Uint8Array; contentType: string } | null>, id: string) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const rows = yield* findOwnedNote(db, user.id, id).pipe(Effect.orDie);
    const note = rows[0];
    // The attachment does not exist apart from its note: an absent note, an
    // absent object, and a note without an attachment are one uniform 404.
    if (!note?.attachmentKey) return yield* new NoteNotFound({ message: "Note not found", id });

    const object = yield* getObject(note.attachmentKey).pipe(Effect.orDie);
    if (!object) return yield* new NoteNotFound({ message: "Note not found", id });

    const view: AttachmentView = {
      name: note.attachmentName ?? note.attachmentKey,
      contentType: object.contentType || note.attachmentType || "application/octet-stream",
      data: encodeBase64(object.bytes),
      size: object.bytes.byteLength,
    };
    return view;
  });

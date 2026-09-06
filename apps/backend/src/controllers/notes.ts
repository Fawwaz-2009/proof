import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { AppApi } from "../contracts/index.ts";
import { Notes } from "../domain/notes.ts";

/**
 * The controller layer: yields the domain service and the filesystem (to
 * read the persisted multipart file part), adapting the contract payload
 * into plain domain inputs. Content-type and size limits are enforced by the
 * contract schema before the domain runs.
 */
export const notesHandlers = HttpApiBuilder.group(AppApi, "notes", (handlers) =>
  Effect.gen(function* () {
    const notes = yield* Notes;
    const fs = yield* FileSystem.FileSystem;

    return handlers.handleAll({
      createNote: ({ payload }) =>
        Effect.gen(function* () {
          const part = payload.image
          const image = part
            ? {
                bytes: yield* fs.readFile(part.path).pipe(Effect.orDie),
                contentType: part.contentType,
              }
            : undefined;
          return yield* notes.createNote({ title: payload.title, body: payload.body, image });
        }),
      listNotes: () => notes.listNotes(),
      destroyNote: ({ params }) => notes.destroyNote(params.id),
    });
  }),
);

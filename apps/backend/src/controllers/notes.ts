import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { AppApi } from "../contracts/index.ts";
import { Notes } from "../domain/notes/index.ts";

/** Thin: hand the typed transport input to the aggregate; the contract's middleware supplies CurrentUser. */
export const NotesHandlersLive = HttpApiBuilder.group(AppApi, "notes", (handlers) =>
  Effect.gen(function* () {
    const notes = yield* Notes;
    return handlers.handleAll({
      listNotes: () => notes.list,
      createNote: ({ payload }) => notes.create(payload),
      destroyNote: ({ params }) => notes.destroy(params.id),
      putAttachment: ({ params, payload }) => notes.putAttachment(params.id, payload),
      getAttachment: ({ params }) => notes.getAttachment(params.id),
    });
  }),
);

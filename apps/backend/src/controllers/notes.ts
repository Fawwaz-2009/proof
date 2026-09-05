/**
 * The notes group: yields the Notes service once at build (temp pattern) and
 * adapts the contract to it. Handler effects carry only the request-scoped
 * requirements the domain methods declare, served per request by the
 * authentication middleware.
 */
import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { AppApi } from "../contracts/index.ts";
import { Notes } from "../domain/notes.ts";

export const notesHandlers = HttpApiBuilder.group(AppApi, "notes", (handlers) =>
  Effect.gen(function* () {
    const notes = yield* Notes;
    return handlers.handleAll({
      listNotes: () => notes.listNotes(),
      createNote: ({ payload }) => notes.createNote({ title: payload.title, body: payload.body }),
      destroyNote: ({ params }) => notes.destroyNote(params.id),
      putAttachment: ({ params, payload }) => notes.putAttachment(params.id, { ...payload }),
      getAttachment: ({ params }) => notes.getAttachment(params.id),
    });
  }),
);

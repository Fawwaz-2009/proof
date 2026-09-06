import { HttpApi } from "effect/unstable/httpapi";
import { NotesApi } from "./notes.ts";

/** Applied once to every group below; code building absolute backend URLs must prepend it. */
export const ApiPrefix = "/api";

export {
  AttachmentMaxBytes,
  AttachmentInput,
  AttachmentView,
  AttachmentTooLarge,
  CreateNote,
  CreateNoteInput,
  DestroyNote,
  GetAttachment,
  ListNotes,
  ListNotesResponse,
  NoteNotFound,
  NotesApi,
  PutAttachment,
} from "./notes.ts";
export { NoteView } from "../views/notes.ts";
export { Authenticated, CurrentUser, SessionUser, Unauthorized } from "./auth.ts";

export class AppApi extends HttpApi.make("sufra").add(NotesApi).prefix(ApiPrefix) {}

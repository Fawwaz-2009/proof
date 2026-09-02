import { HttpApi } from "effect/unstable/httpapi";
import { DevMailboxApi } from "./dev-mailbox.ts";
import { NotesApi } from "./notes.ts";
import { SessionApi } from "./session.ts";

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
export { DevMailboxApi, DevMailboxNotFound, DevMailboxResponse, GetDevMailbox } from "./dev-mailbox.ts";
export { GetSession, SessionApi, SessionResponse } from "./session.ts";
export { Authenticated, CurrentUser, SessionUser, Unauthorized } from "./auth.ts";

export class AppApi extends HttpApi.make("sufra").add(SessionApi, NotesApi).prefix(ApiPrefix) {}

export class DevelopmentApi extends HttpApi.make("sufra-development").add(DevMailboxApi).prefix(ApiPrefix) {}

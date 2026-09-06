import { HttpApi } from "effect/unstable/httpapi";
import { NotesApi } from "./notes.ts";

/** Applied once to every group below; code building absolute backend URLs must prepend it. */
export const ApiPrefix = "/api";

export {
  CreateNote,
  CreateNoteInput,
  DestroyNote,
  ImageContentTypes,
  ListNotes,
  ListNotesResponse,
  MaxImageBytes,
  NotesApi,
} from "./notes.ts";
export { Authenticated, CurrentUser, SessionUser, Unauthorized } from "./auth.ts";

export class AppApi extends HttpApi.make("sufra").add(NotesApi).prefix(ApiPrefix) {}

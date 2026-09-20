import { HttpApi } from "effect/unstable/httpapi";
import { NotesApi } from "./notes.ts";
import { PreviewApi } from "./preview.ts";

/** Applied once to every group below; code building absolute backend URLs must prepend it. */
export const ApiPrefix = "/api";

export { CreateNote, CreateNoteInput, DestroyNote, ImageContentTypes, ListNotes, ListNotesResponse, MaxImageBytes, NotesApi, ValidationError } from "./notes.ts";
export { Authenticated, CurrentUser, SessionUser, Unauthorized } from "./auth.ts";
export { GetMobilePreviewStatus, MobilePreviewRecord, MobilePreviewRecordState, MobilePreviewStatus, MobilePreviewTarget, PreviewApi } from "./preview.ts";

export class AppApi extends HttpApi.make("app").add(NotesApi).add(PreviewApi).prefix(ApiPrefix) {}

import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as AtomHttpApi from "effect/unstable/reactivity/AtomHttpApi";
import { HttpApiClient } from "effect/unstable/httpapi";
import { AppApi } from "@sufra/backend/contract";

/**
 * The typed HTTP client for the browser. Reads subscribe through
 * `AppClient.query(group, endpoint, request)` — atoms derived from the
 * contract. Writes are the derived mutation atoms below. URLs, query
 * encoding, and response decoding come from the shared contract. Multipart
 * payloads (createNote with an image) are passed as `FormData`.
 */
export class AppClient extends AtomHttpApi.Service<AppClient>()("AppClient", { api: AppApi, httpClient: FetchHttpClient.layer }) { }


export const createNoteAtom = AppClient.mutation("notes", "createNote");
export const destroyNoteAtom = AppClient.mutation("notes", "destroyNote");

import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as AtomHttpApi from "effect/unstable/reactivity/AtomHttpApi";
import * as Option from "effect/Option";
import { AppApi, ValidationError } from "@sufra/backend/contract";

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

/**
 * Toast/copy text for a failed mutation. `error` is the mutation atom's typed
 * error channel (`Cause.findErrorOption(exit.cause)`). Every member of the union carries a
 * server-authored message (`ValidationError`, `HttpApiError.NotFound`, ...), so the filter is just the
 * guard; `None` means a defect (oversize-upload 413, transport failure), which
 * gets the caller's fallback.
 */
export const mutationErrorMessage = (error: Option.Option<unknown>, fallback: string): string =>
  Option.getOrElse(
    Option.map(error, (e) => (e instanceof ValidationError ? e.message : fallback)),
    () => fallback,
  );

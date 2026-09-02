import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as AtomHttpApi from "effect/unstable/reactivity/AtomHttpApi";
import * as Effect from "effect/Effect";
import { HttpApiClient } from "effect/unstable/httpapi";
import { AppApi } from "@sufra/backend/contract";

/**
 * The typed HTTP client for the browser. Reads subscribe through
 * `AppClient.query(group, endpoint, request)` — atoms derived from the
 * contract. Writes are the derived mutation atoms below. URLs, query
 * encoding, and response decoding come from the shared contract.
 */
export class AppClient extends AtomHttpApi.Service<AppClient>()("AppClient", { api: AppApi, httpClient: FetchHttpClient.layer }) {}

export const createNoteAtom = AppClient.mutation("notes", "createNote");
export const destroyNoteAtom = AppClient.mutation("notes", "destroyNote");
export const putAttachmentAtom = AppClient.mutation("notes", "putAttachment");

/** One-shot attachment read for the download button; list views stay query atoms. */
export const getAttachment = (id: string, baseUrl = globalThis.location.origin) =>
  HttpApiClient.make(AppApi, { baseUrl }).pipe(
    Effect.flatMap((client) => client.notes.getAttachment({ params: { id } })),
    Effect.provide(FetchHttpClient.layer),
    Effect.runPromise,
  );

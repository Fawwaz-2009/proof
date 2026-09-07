import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import type * as HttpApi from "effect/unstable/httpapi/HttpApi";
import { HttpApiClient } from "effect/unstable/httpapi";
import * as Effect from "effect/Effect";
import { createIsomorphicFn } from "@tanstack/react-start";
import { AppApi, ValidationError } from "@starting-flare/backend/contract";

type Groups = typeof AppApi extends HttpApi.HttpApi<infer _Id, infer Groups> ? Groups : never;

/**
 * The contract-derived typed client. Isomorphic:
 * - browser: `fetch("/api/...")` same-origin, cookies automatic (api.$.ts proxies to the binding);
 * - server (SSR loaders): BACKEND service binding with the SSR request's cookies forwarded
 *   (see server/backend-client.server.ts).
 */
export type AppClient = HttpApiClient.Client<Groups>;

let cached: Promise<AppClient> | undefined;

export const getAppClient = (): Promise<AppClient> => {
  cached ??= buildAppClient();
  return cached;
};

/**
 * One typed client, two transports, selected per environment by the framework
 * (the .server() implementation is stripped from client bundles):
 * - client: fetch("/api/...") same-origin, cookies automatic (api.$.ts proxies
 *   to the binding);
 * - server (SSR loaders): BACKEND service binding with the SSR request's
 *   cookies forwarded (see server/backend-client.server.ts).
 */
const buildAppClient = createIsomorphicFn()
  .server(
    (): Promise<AppClient> =>
      import("./server/backend-client.server").then((server) => Effect.runPromise(server.AppClient)),
  )
  .client(
    (): Promise<AppClient> => Effect.runPromise(HttpApiClient.make(AppApi).pipe(Effect.provide(FetchHttpClient.layer))),
  );

/**
 * Toast/copy text for a failed mutation. `error` is the mutation's decoded
 * error instance: the server-authored `ValidationError` message wins,
 * anything else (defects like the oversize-upload 413, transport failures)
 * gets the caller's fallback.
 */
export const mutationErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof ValidationError ? error.message : fallback;

import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import type * as HttpApi from "effect/unstable/httpapi/HttpApi";
import { HttpApiClient } from "effect/unstable/httpapi";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { AppApi, ValidationError } from "@app/backend/contract";
import { authClient } from "./auth-client";
import { apiUrl } from "./env";

type Groups = typeof AppApi extends HttpApi.HttpApi<infer _Id, infer Groups> ? Groups : never;

/** The contract-derived typed client: no hand-written URLs, no response decoding. */
export type AppClient = HttpApiClient.Client<Groups>;

/**
 * The native transport: the absolute stage URL, plus the better-auth session
 * cookie from SecureStore attached as a header (native fetch has no cookie
 * jar). Same shape as the web's server transport
 * (apps/web/src/server/backend-client.server.ts), different lane: this one
 * crosses the network instead of a service binding.
 */
const transport = HttpClient.make((request, url, signal) =>
  Effect.gen(function* () {
    const cookie = yield* Effect.promise(() => Promise.resolve(authClient.getCookie()));
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (value !== undefined) headers.set(key, value);
    }
    if (cookie) headers.set("cookie", cookie);
    // No content-type fixups: Effect strips content-type and content-length
    // for FormData bodies, and expo/fetch sets the multipart boundary
    // itself. `credentials: omit` matches better-auth's own client: the
    // cookie comes from SecureStore, so the platform cookie jar must not
    // add a second one.
    const body =
      request.body._tag === "Raw" || request.body._tag === "Uint8Array"
        ? (request.body.body as globalThis.BodyInit)
        : request.body._tag === "FormData"
          ? (request.body.formData as globalThis.BodyInit)
          : undefined; // stream bodies never cross this lane
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url.toString(), {
          method: request.method,
          headers,
          body,
          signal,
          credentials: "omit",
        }),
      catch: (cause) =>
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({ request, cause }),
        }),
    });
    return HttpClientResponse.fromWeb(request, response);
  }),
);

let cached: Promise<AppClient> | undefined;

/** One typed client per app session, built lazily against the baked stage URL. */
export const getAppClient = (): Promise<AppClient> =>
  (cached ??= Effect.runPromise(HttpApiClient.make(AppApi, { baseUrl: apiUrl }).pipe(Effect.provide(Layer.succeed(HttpClient.HttpClient, transport)))));

/**
 * Copy for a failed mutation, exactly like the web's helper: the
 * server-authored `ValidationError` message wins, anything else (defects
 * such as the oversize-upload 413, transport failures) gets the fallback.
 */
export const mutationErrorMessage = (error: unknown, fallback: string): string => (error instanceof ValidationError ? error.message : fallback);

import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import type * as HttpApi from "effect/unstable/httpapi/HttpApi";
import { HttpApiClient } from "effect/unstable/httpapi";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { AppApi } from "@alchemy-flare/backend/contract";

type Groups = typeof AppApi extends HttpApi.HttpApi<infer _Id, infer Groups> ? Groups : never;

/**
 * Server-side transport for the typed client: instead of global fetch, every
 * request rides the BACKEND service binding, forwarding the incoming SSR
 * request's headers so the session cookie reaches the backend's auth
 * middleware (the same trick as the `getSession` server function).
 *
 * The constant baseUrl exists only because `Url.make` resolves the contract's
 * relative `/api` paths against `location.origin`, which workerd lacks; the
 * binding routes by env, not hostname.
 */
const transport = HttpClient.make((request, url, signal) => {
  const incoming = getRequest();
  const headers = new Headers(incoming.headers);
  for (const [key, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(key, value);
  }
  headers.delete("content-length");
  const body =
    request.body._tag === "Raw" || request.body._tag === "Uint8Array"
      ? (request.body.body as globalThis.BodyInit)
      : request.body._tag === "FormData"
        ? request.body.formData
        : undefined; // stream bodies never cross the server lane
  return Effect.map(
    Effect.tryPromise({
      try: () =>
        env.BACKEND.fetch(
          new Request(url, {
            method: request.method,
            headers,
            body,
            signal,
          }),
        ),
      catch: (cause) =>
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({ request, cause }),
        }),
    }),
    (response) => HttpClientResponse.fromWeb(request, response),
  );
});

export const AppClient: Effect.Effect<HttpApiClient.Client<Groups>, never, never> = HttpApiClient.make(AppApi, {
  baseUrl: "https://alchemy-flare-backend.internal",
}).pipe(Effect.provide(Layer.succeed(HttpClient.HttpClient, transport)));

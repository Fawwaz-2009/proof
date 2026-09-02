import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import * as Schema from "effect/Schema";
import { ApiPrefix, GetSession, SessionResponse } from "@sufra/backend/contract";

/** Read the session server-side before rendering a protected route. */
export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const incoming = getRequest();
  const url = new URL(`${ApiPrefix}${GetSession.path}`, incoming.url);
  const response = await env.BACKEND.fetch(
    new Request(url, {
      headers: incoming.headers,
    }),
  );

  if (!response.ok) {
    throw new Error("Unable to read the current session");
  }

  const session = await Schema.decodeUnknownPromise(SessionResponse)(await response.json());
  return await Schema.encodePromise(SessionResponse)(session);
});

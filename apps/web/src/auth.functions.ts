import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { ApiPrefix } from "@sufra/backend/contract";

/**
 * Read the session server-side before rendering a protected route. The web
 * worker holds no auth instance: the check rides the BACKEND service
 * binding to better-auth's native session endpoint, forwarding the
 * incoming request's cookies.
 */
export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const incoming = getRequest();
  const url = new URL(`${ApiPrefix}/auth/get-session`, incoming.url);
  return await env.BACKEND.fetch(
    new Request(url, {
      headers: incoming.headers,
    }),
  ).then((response) => (response.ok ? response.json() : null));
});

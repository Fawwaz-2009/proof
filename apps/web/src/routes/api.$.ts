import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      ANY: ({ request }) => {
        // Forward the edge-set client IP as x-client-ip for the backend's
        // rate limiters. Overwrite unconditionally: a client-supplied
        // x-client-ip must never decide who gets limited.
        const forwarded = new Request(request);
        const ip = forwarded.headers.get("cf-connecting-ip");
        if (ip) forwarded.headers.set("x-client-ip", ip);
        else forwarded.headers.delete("x-client-ip");
        return env.BACKEND.fetch(forwarded);
      },
    },
  },
});

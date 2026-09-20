#!/usr/bin/env bun
import { loadProbeOutputs } from "./android-preview-outputs.ts";

// A short-lived, loopback-only test client. Browser traffic still crosses the
// real public Cloudflare route. Service-token values never enter browser code.
const outputs = await loadProbeOutputs();
const origin = `https://${outputs.hostname}`;
const port = Number(process.env.ANDROID_PREVIEW_VERIFY_PORT ?? "18081");
const localOrigin = `http://127.0.0.1:${port}`;
const authHeaders = {
  "CF-Access-Client-Id": outputs.verificationClientId,
  "CF-Access-Client-Secret": outputs.verificationClientSecret.__redacted__,
};
type Connection = { upstream: WebSocket; queued: Array<string | Buffer>; ready: boolean };

const server = Bun.serve<Connection>({
  hostname: "127.0.0.1",
  port,
  async fetch(request, server) {
    const url = new URL(request.url);
    const requestOrigin = request.headers.get("Origin");
    if ((requestOrigin && requestOrigin !== localOrigin) || request.headers.get("Sec-Fetch-Site") === "cross-site") {
      return new Response("Forbidden", { status: 403 });
    }
    const upstreamUrl = new URL(url.pathname + url.search, origin);
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      if (requestOrigin !== localOrigin || url.pathname !== "/websockify") return new Response("Forbidden", { status: 403 });
      upstreamUrl.protocol = "wss:";
      const upstream = new WebSocket(upstreamUrl, { headers: { ...authHeaders, Origin: origin } });
      upstream.binaryType = "arraybuffer";
      const data: Connection = { upstream, queued: [], ready: false };
      if (server.upgrade(request, { data })) return;
      upstream.close();
      return new Response("Upgrade failed", { status: 500 });
    }
    const response = await fetch(upstreamUrl, { headers: authHeaders, redirect: "manual" });
    const headers = new Headers(response.headers);
    headers.delete("set-cookie");
    headers.delete("content-encoding");
    headers.delete("content-length");
    headers.set("cache-control", "no-store");
    return new Response(response.body, { status: response.status, headers });
  },
  websocket: {
    open(socket) {
      const upstream = socket.data.upstream;
      upstream.onopen = () => {
        socket.data.ready = true;
        for (const item of socket.data.queued) upstream.send(item);
        socket.data.queued = [];
      };
      upstream.onmessage = (event) => socket.send(event.data);
      upstream.onclose = () => socket.close();
      upstream.onerror = () => socket.close(1011, "Public preview connection failed");
    },
    message(socket, message) {
      if (socket.data.ready) socket.data.upstream.send(message);
      else if (socket.data.queued.length < 32) socket.data.queued.push(message);
      else socket.close(1009, "Input queue exceeded");
    },
    close(socket) {
      socket.data.upstream.close();
    },
  },
});
console.log(`Public-route verification client: ${localOrigin}`);
setTimeout(() => {
  server.stop(true);
  process.exit(0);
}, 30 * 60_000);

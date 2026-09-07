import * as Cloudflare from "alchemy/Cloudflare";
import { Context, Effect, Layer, Option } from "effect";
import type { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import { HttpServerResponse } from "effect/unstable/http";

/**
 * Edge rate limits, backed by Cloudflare Rate Limit bindings (period must be
 * 10 or 60 seconds; counters are local to a Cloudflare location and
 * eventually consistent: an abuse clamp, not an accounting system).
 *
 * Two tiers:
 *
 * - Global: every request the backend serves, keyed by client IP. A generous
 *   bad-actor clamp: high enough that an office behind one NAT never trips
 *   it, low enough to stop runaway scripts and floods. Deliberately keyed by
 *   IP despite the docs' general advice: the alternative (resolving the
 *   session before every request) costs more than the threat it removes.
 *
 * - Auth: the /api/auth surface (OTP send, sign-in), keyed by IP. Strict,
 *   because each request can cost a real email. Better Auth's own D1-backed
 *   per-route limits (config/auth.ts) sit underneath as the fine-grained,
 *   identity-keyed tier.
 *
 * namespaceId is ACCOUNT-global: two bindings sharing one id share counters,
 * across Workers and across apps. 9001/9002 belong to starting-flare; pick fresh ids
 * for sibling products on the same Cloudflare account.
 */
export const GlobalRateLimit = Cloudflare.RateLimit("GlobalRateLimit", {
  namespaceId: 9001,
  simple: { limit: 300, period: 60 },
});

export const AuthRateLimit = Cloudflare.RateLimit("AuthRateLimit", {
  namespaceId: 9002,
  simple: { limit: 5, period: 60 },
});

/**
 * The client IP the backend should key on: the x-client-ip stamp the public
 * website applies at its proxy seam (overwriting anything a client sent),
 * falling back to the edge-set cf-connecting-ip, then a shared "unknown"
 * bucket when neither exists (local runs).
 */
export const clientIp = (request: HttpServerRequest): string =>
  request.headers["x-client-ip"] ?? request.headers["cf-connecting-ip"] ?? "unknown";

const tooManyRequests = HttpServerResponse.text("Too Many Requests", {
  status: 429,
  headers: { "retry-after": "60" },
});

export class RateLimits extends Context.Service<RateLimits>()("RateLimits", {
  make: Effect.gen(function* () {
    // Resolved once at build; the limit() effects carry only the
    // request-scoped RuntimeContext alchemy serves per call.
    const globalLimiter = yield* GlobalRateLimit;
    const authLimiter = yield* AuthRateLimit;
    // Fail-open: the limiter is abuse protection, not a business rule. If the
    // binding is unavailable (or the local runtime lacks it), allow the
    // request through rather than take the API down.
    const allowAll = { success: true };

    return {
      global: (key: string) =>
        Effect.map(Effect.option(globalLimiter.limit({ key })), Option.getOrElse(() => allowAll)),
      auth: (key: string) =>
        Effect.map(Effect.option(authLimiter.limit({ key })), Option.getOrElse(() => allowAll)),
      tooManyRequests,
    };
  }),
}) {
  static readonly Live = Layer.effect(this, this.make).pipe(
    Layer.provide(Cloudflare.Workers.RateLimitBinding),
  );
}


import { Config, Effect, Schema } from "effect";
import { ambientStage } from "./stage";
import { ALCHEMY_DEV, ALCHEMY_PHASE } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { ENV_BINDINGS } from "./env";

const otpDeliveryMode = Config.schema(Schema.Literals(["mailbox", "send"]), ENV_BINDINGS.otpDelivery);
const devMailboxAllowedHosts = Config.string(ENV_BINDINGS.devMailboxAllowedHosts).pipe(Config.withDefault(""));
const emailFromConfig = Config.string("AUTH_EMAIL_FROM").pipe(Config.withDefault("Sufra <noreply@localhost>"));
const allowedHostsConfig = Config.string("AUTH_ALLOWED_HOSTS").pipe(Config.withDefault(defaultAllowedHosts));

export const emailTemp = Effect.gen(function* () {
  const stage = yield* ambientStage;
  const isRuntime = (yield* ALCHEMY_PHASE) === "runtime";
  const deliveryMode = isRuntime ? yield* otpDeliveryMode.pipe(Effect.orDie) : stage === "prod" ? "send" : "mailbox";
  const devMailboxHosts = parseHostList(isRuntime ? yield* devMailboxAllowedHosts.pipe(Effect.orDie) : "");
  const emailFrom = yield* emailFromConfig.pipe(Effect.orDie);
  const allowedHosts = yield* allowedHostsConfig.pipe(Effect.orDie)
  const isDevRuntime = yield* Effect.orDie(ALCHEMY_DEV);

  const captureOtp = deliveryMode === "mailbox" || isDevRuntime;
  const sender = captureOtp ? undefined : yield* Cloudflare.Email.SendEmail("Email");
  if (sender) yield* Cloudflare.Email.Send(sender);
  const canAccessDevMailbox = (url: string) => isDevMailboxUrl(url, devMailboxHosts);

  const otpSenderLive: Layer.Layer<OtpSender, never, Database | Cloudflare.Email.Send> =
    captureOtp || !sender ? otpSenderMailboxLive : otpSenderEmailLive(sender, emailFrom);
  const otpSender = Context.get(
    yield* Layer.build(Layer.provide(otpSenderLive, Layer.mergeAll(Layer.succeed(Database, { db }), Cloudflare.Email.SendBinding))),
    OtpSender,
  );
});

/** Split a comma-separated host-pattern list into its entries. */
function parseHostList(value: string): Array<string> {
  return value
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

/**
 * Host rule for OTP-related development access: `http://localhost` always
 * qualifies; deployed non-prod stages add `*.workers.dev` through the
 * `DEV_MAILBOX_ALLOWED_HOSTS` env, production ships an empty list.
 */
function isDevMailboxUrl (value: string, allowedHosts: ReadonlyArray<string> = []): boolean {
  try {
    const { host, hostname, protocol } = new URL(value);
    const matchesAllowedHost = allowedHosts.some((allowedHost) => {
      const normalized = allowedHost.trim().toLowerCase();
      if (normalized.startsWith("*.")) {
        const suffix = normalized.slice(1);
        return hostname.endsWith(suffix) && hostname.length > suffix.length;
      }
      return normalized === host;
    });
    return (
      (protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost"))) ||
      ((protocol === "http:" || protocol === "https:") && matchesAllowedHost)
    );
  } catch {
    return false;
  }
};

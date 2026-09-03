import * as Config from "effect/Config";
import * as Schema from "effect/Schema";

/**
 * The Worker's plain env-var seam. The props phase ships values under these
 * names (`switchesForStage` is the single writer of the literals); the runtime
 * phase reads the same keys back through `effect/Config` — alchemy auto-wires
 * a ConfigProvider over the Worker's env for every request. Resource bindings
 * (D1, R2, send_email) resolve through alchemy's binding services keyed by
 * their LogicalIds and never appear here.
 */
export const ENV_BINDINGS = {
  /** "mailbox" captures sign-in codes in the dev mailbox; "send" delivers via the send_email binding. */
  otpDelivery: "OTP_DELIVERY",
  /** Comma-separated host patterns where the dev-mailbox read endpoint answers; empty disables remote reads. */
  devMailboxAllowedHosts: "DEV_MAILBOX_ALLOWED_HOSTS",
} as const;

/** The OTP policy in one place: every stage except production captures codes in the dev mailbox (and may auto-fill them); production delivers via send_email. */
export const capturesOtp = (stage: string): boolean => stage !== "prod";

/** The plan-time mapping from stage onto shipped switch values; the only writer of the literals. */
export const switchesForStage = (stage: string): Record<string, string> => ({
  [ENV_BINDINGS.otpDelivery]: capturesOtp(stage) ? "mailbox" : "send",
  [ENV_BINDINGS.devMailboxAllowedHosts]: capturesOtp(stage) ? "*.workers.dev" : "",
});

/**
 * The runtime reads. A malformed value fails the Worker before it serves;
 * a missing OTP_DELIVERY means the props seam broke, so it has no default.
 */
export const otpDeliveryMode = Config.schema(Schema.Literals(["mailbox", "send"]), ENV_BINDINGS.otpDelivery);
export const devMailboxAllowedHosts = Config.string(ENV_BINDINGS.devMailboxAllowedHosts).pipe(Config.withDefault(""));


/**
 * Per-stage switches for the Backend Worker — the `config/environments` analogue.
 *
 * Pure values only: this module is evaluated at plan time and, per request,
 * inside the deployed Worker, so it must never touch `import.meta.url`,
 * `process.env`, or Alchemy resources. The stage is the only input.
 */

/** The exact `true`/`false`/host-list strings the Worker env carries. */
export type BackendEnvironmentSwitches = {
  readonly DEV_MAILBOX_ENABLED: "true" | "false";
  readonly DEV_MAILBOX_ALLOWED_HOSTS: string;
  readonly EMAIL_SENDER: "disabled" | "enabled";
};

export const backendEnvironmentFor = (stage: string): BackendEnvironmentSwitches => {
  const nonProduction = stage !== "prod";
  return {
    DEV_MAILBOX_ENABLED: nonProduction ? "true" : "false",
    DEV_MAILBOX_ALLOWED_HOSTS: nonProduction ? "*.workers.dev" : "",
    EMAIL_SENDER: nonProduction ? "disabled" : "enabled",
  };
};

/** Comma-separated host patterns Better Auth accepts origins from; overridable via AUTH_ALLOWED_HOSTS. */
export const defaultAllowedHosts = "localhost:*,127.0.0.1:*,*.workers.dev";

/** Split a comma-separated host-pattern list into its entries. */
export const parseHostList = (value: string): Array<string> =>
  value
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

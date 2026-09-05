/**
 * The Worker's plain env-var seam. Values a Worker reads at request time are
 * declared as `effect/Config` values next to the service that consumes them
 * (see email.ts's `emailFromConfig`, auth.ts's `allowedHostsConfig`) and
 * shipped through the props phase's `env` object — alchemy auto-wires a
 * ConfigProvider over the Worker's env for every request. Resource bindings
 * (D1, R2, send_email) resolve through alchemy's binding services keyed by
 * their LogicalIds and never appear here.
 *
 * The dev-mailbox switches (OTP_DELIVERY, DEV_MAILBOX_ALLOWED_HOSTS) are
 * gone: non-prod environments capture email to the log via the `environment`
 * primitive (see email.ts); production delivers through the send_email
 * binding.
 */

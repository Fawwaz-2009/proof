import * as Alchemy from "alchemy";
import * as AWS from "alchemy/AWS";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Output from "alchemy/Output";
import * as Schema from "effect/Schema";
import { STACK } from "../identity.ts";
import { PROBE_BRIDGE_PORT, buildProbeTemplate } from "../scripts/android-preview-template.ts";

// The Phase 0 feasibility probe, owned separately from the application stack and
// from the later platform stack, so it can be destroyed without touching either.
//
// What it creates, in one alchemy graph:
//   1. A CloudFormation stack whose template is built by the pure module
//      scripts/android-preview-template.ts. The template, not alchemy, expresses
//      `CpuOptions.NestedVirtualization` because alchemy beta.79's LaunchTemplate
//      wrapper has no field for it (verified against the installed types).
//   2. A Cloudflare Tunnel whose ingress points at the loopback-only bridge, so
//      the browser route is proven over the same product the platform will use.
//
// Deliberately absent, and owned by the next slice rather than faked here: the
// host bootstrap that installs the emulator and the bridge, the DNS hostname
// route for the tunnel, and the measurement runner. See
// docs/android-preview-feasibility.md for what is measured and what is not.
//
// Nothing here is a "who" or a "where": region, AMI, hostname, and instance type
// come from the environment, because this file is committed and a clone must not
// inherit the author's account choices. Inputs are validated at synthesis, so a
// missing value fails before any resource is created.

interface ProbeInputs {
  readonly region: string;
  readonly amiId: string;
  readonly hostname: string | undefined;
  readonly instanceType: string | undefined;
}

const AMI_ERROR =
  "ANDROID_PREVIEW_AMI_ID is required: the AMI is per-region, so it must be pinned for the region " +
  "you deploy into. Resolve the Amazon Linux 2023 x86_64 image there and set it in .env " +
  '(see .env.example). The probe records the image it actually ran, so "latest" is not acceptable.';

/**
 * There is no default region, on purpose. It decides cost, client latency against
 * the 500 ms budget, and whether the instance family is offered at all, so a
 * silent default would be a wrong answer that looks like a working one. The AWS
 * CLI's own variables are accepted so a configured machine needs no second
 * source of truth.
 */
const REGION_KEYS = ["ANDROID_PREVIEW_REGION", "AWS_REGION", "AWS_DEFAULT_REGION"] as const;

const nonEmpty = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
};

/**
 * The tunnel's public hostname needs a proxied CNAME to the tunnel, and the DNS
 * record is created in code for the same reason the tunnel is: a record clicked
 * into a dashboard proves nothing about a template. The zone is discovered from
 * the hostname instead of being configured, so an adopter sets one value.
 */
const resolveZoneId = async (hostname: string, token: string | undefined): Promise<string> => {
  if (token === undefined) {
    throw new Error("CLOUDFLARE_API_TOKEN is required to resolve the zone that hosts ANDROID_PREVIEW_PROBE_HOSTNAME.");
  }
  const labels = hostname.split(".");
  for (let index = 0; index < labels.length - 1; index += 1) {
    const candidate = labels.slice(index).join(".");
    const response = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(candidate)}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = (await response.json()) as { success?: boolean; result?: Array<{ id: string }> };
    const zone = body.success === true ? body.result?.[0] : undefined;
    if (zone !== undefined) return zone.id;
  }
  throw new Error(`No Cloudflare zone in this account matches any suffix of ${hostname}.`);
};

const resolveInputs = (env: Record<string, string | undefined>): ProbeInputs => {
  const region = REGION_KEYS.map((key) => nonEmpty(env[key])).find((value) => value !== undefined);
  if (region === undefined) {
    throw new Error(
      `No region is set. Set ANDROID_PREVIEW_REGION in .env (see .env.example), or let the AWS CLI ` +
        `provide AWS_REGION / AWS_DEFAULT_REGION. Checked: ${REGION_KEYS.join(", ")}.`,
    );
  }
  const amiId = nonEmpty(env.ANDROID_PREVIEW_AMI_ID);
  if (amiId === undefined) throw new Error(AMI_ERROR);
  // Optional on purpose: the acceleration gate needs only the host, and the
  // tunnel needs Cloudflare permission the CI token does not carry. Setting the
  // hostname adds the tunnel; leaving it unset keeps this run to AWS alone.
  return { region, amiId, hostname: nonEmpty(env.ANDROID_PREVIEW_PROBE_HOSTNAME), instanceType: nonEmpty(env.ANDROID_PREVIEW_INSTANCE_TYPE) };
};

const inputs = resolveInputs(process.env);
const reviewerEmail = nonEmpty(process.env.ANDROID_PREVIEW_REVIEWER_EMAIL);
if (inputs.hostname && !reviewerEmail) throw new Error("ANDROID_PREVIEW_REVIEWER_EMAIL is required for the protected browser preview.");

// One-time PIN is account-wide. Reuse an existing provider without adopting it:
// destroying this disposable probe must not remove somebody else's login method.
const existingEmailLogin = inputs.hostname
  ? await (async () => {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/access/identity_providers`, {
        headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
      });
      if (!response.ok) throw new Error(`Cannot inspect Access login methods: HTTP ${response.status}`);
      const body = Schema.decodeUnknownSync(Schema.Struct({ result: Schema.Array(Schema.Struct({ id: Schema.String, type: Schema.String })) }))(await response.json());
      return body.result.find((provider) => provider.type === "onetimepin")?.id;
    })()
  : undefined;
const accessTeam = inputs.hostname
  ? await (async () => {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/access/organizations`, {
        headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
      });
      if (!response.ok) throw new Error(`Cannot inspect Access organization: HTTP ${response.status}`);
      const body = Schema.decodeUnknownSync(Schema.Struct({ result: Schema.Struct({ auth_domain: Schema.String }) }))(await response.json());
      return body.result.auth_domain.replace(/\.cloudflareaccess\.com$/, "");
    })()
  : undefined;

// The AWS provider follows AWS_REGION (Region.fromEnvironment), while the
// template above is built from the resolved input. Pinning the environment to
// the resolved value is what keeps them from disagreeing, which matters because
// a CLI default in another region would otherwise place the stack somewhere its
// tags and its region-specific AMI both describe incorrectly.
process.env.AWS_REGION = inputs.region;

const template = buildProbeTemplate({
  amiId: inputs.amiId,
  region: inputs.region,
  instanceType: inputs.instanceType,
  tags: { "proof:stack": `${STACK}AndroidPreviewProbe` },
});

export default Alchemy.Stack(
  `${STACK}AndroidPreviewProbe`,
  {
    providers: Layer.mergeAll(Cloudflare.providers(), AWS.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const login =
      inputs.hostname && !existingEmailLogin
        ? yield* Cloudflare.Access.IdentityProvider("probe-login", { name: `${STACK} preview email login`, type: "onetimepin", config: {} })
        : undefined;
    const testToken =
      inputs.hostname && process.env.ANDROID_PREVIEW_VERIFICATION !== "false"
        ? yield* Cloudflare.Access.ServiceToken("probe-verification", { name: `${STACK} preview verification`, duration: "24h" })
        : undefined;
    const loginId = existingEmailLogin ?? login?.identityProviderId;
    const access =
      inputs.hostname && reviewerEmail && loginId
        ? yield* Cloudflare.Access.Application("probe-access", {
            name: `${STACK} Android preview`,
            type: "self_hosted",
            domain: inputs.hostname,
            sessionDuration: "6h",
            allowedIdps: [loginId],
            policies: [
              { name: "Owner", decision: "allow", include: [{ email: reviewerEmail }] },
              ...(testToken ? [{ name: "Bounded verification", decision: "non_identity" as const, include: [{ serviceToken: testToken.serviceTokenId }] }] : []),
            ],
          })
        : undefined;
    // Outputs are read back by the measurement runner; the instance id is the
    // handle every later step (SSM commands, stop, delete) needs.
    const host = yield* AWS.CloudFormation.Stack("probe-host", {
      stackName: `${STACK}-android-preview-probe`,
      templateBody: JSON.stringify(template, null, 2),
      capabilities: ["CAPABILITY_IAM"],
      tags: { "proof:component": "android-preview-probe" },
    });

    // The tunnel arrives with the streaming slice: it needs Cloudflare
    // permission the CI token does not carry, and the acceleration gate does
    // not. Set ANDROID_PREVIEW_PROBE_HOSTNAME to add it, plus the proxied CNAME
    // that actually publishes it.
    const hostname = inputs.hostname;
    // beta.79's narrow origin type omits Access, but forwards the full object
    // to Cloudflare's typed API. Keep this as data without a type assertion.
    const originRequest =
      access && accessTeam
        ? {
            connectTimeout: 30,
            access: { required: true, teamName: accessTeam, audTag: [access.aud] },
          }
        : undefined;
    const tunnel =
      hostname === undefined
        ? undefined
        : yield* Cloudflare.Tunnel.Tunnel("probe-tunnel", {
            name: `${STACK}-android-preview-probe`,
            configSrc: "cloudflare",
            ingress: [{ hostname, service: `http://localhost:${PROBE_BRIDGE_PORT}`, originRequest }, { service: "http_status:404" }],
          });

    const route =
      hostname === undefined || tunnel === undefined
        ? undefined
        : yield* Cloudflare.DNS.Record("probe-hostname", {
            zoneId: yield* Effect.promise(() => resolveZoneId(hostname, process.env.CLOUDFLARE_API_TOKEN)),
            name: hostname,
            type: "CNAME",
            // tunnelId is only known at deploy time, so it composes as an Output.
            content: Output.interpolate`${tunnel.tunnelId}.cfargotunnel.com`,
            proxied: true,
            ttl: 1,
            comment: "Android browser preview probe public hostname",
          });

    return {
      region: inputs.region,
      instanceId: host.outputs.InstanceId,
      launchTemplateId: host.outputs.LaunchTemplateId,
      securityGroupId: host.outputs.SecurityGroupId,
      tunnelId: tunnel?.tunnelId,
      tunnelName: tunnel?.tunnelName,
      hostname,
      recordId: route?.recordId,
      // Handed to the host bootstrap, never printed: status output redacts it.
      tunnelToken: tunnel?.token,
      accessAudience: access?.aud,
      verificationClientId: testToken?.clientId,
      verificationClientSecret: testToken?.clientSecret,
    };
  }),
);

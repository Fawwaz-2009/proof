import * as Alchemy from "alchemy";
import * as AWS from "alchemy/AWS";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
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
  readonly hostname: string;
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
  const hostname = nonEmpty(env.ANDROID_PREVIEW_PROBE_HOSTNAME);
  if (hostname === undefined) {
    throw new Error(
      "ANDROID_PREVIEW_PROBE_HOSTNAME is required, for example android-probe.example.com: the tunnel " +
        "routes this hostname to the host's loopback bridge, and it must be in a zone on this account.",
    );
  }
  return { region, amiId, hostname, instanceType: nonEmpty(env.ANDROID_PREVIEW_INSTANCE_TYPE) };
};

const inputs = resolveInputs(process.env);
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
    // Outputs are read back by the measurement runner; the instance id is the
    // handle every later step (SSM commands, stop, delete) needs.
    const host = yield* AWS.CloudFormation.Stack("probe-host", {
      stackName: `${STACK}-android-preview-probe`,
      templateBody: JSON.stringify(template, null, 2),
      capabilities: ["CAPABILITY_IAM"],
      tags: { "proof:component": "android-preview-probe" },
    });

    const tunnel = yield* Cloudflare.Tunnel.Tunnel("probe-tunnel", {
      name: `${STACK}-android-preview-probe`,
      configSrc: "cloudflare",
      ingress: [{ hostname: inputs.hostname, service: `http://localhost:${PROBE_BRIDGE_PORT}` }, { service: "http_status:404" }],
    });

    return {
      region: inputs.region,
      instanceId: host.outputs.InstanceId,
      launchTemplateId: host.outputs.LaunchTemplateId,
      securityGroupId: host.outputs.SecurityGroupId,
      tunnelId: tunnel.tunnelId,
      tunnelName: tunnel.tunnelName,
      // Handed to the host bootstrap, never printed: status output redacts it.
      tunnelToken: tunnel.token,
    };
  }),
);

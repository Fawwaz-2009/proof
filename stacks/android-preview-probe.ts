import * as Alchemy from "alchemy";
import * as AWS from "alchemy/AWS";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { STACK } from "../identity.ts";
import { PROBE_BRIDGE_PORT, PROBE_DEFAULT_REGION, buildProbeTemplate } from "../scripts/android-preview-template.ts";

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
// Inputs are validated here, at synthesis, so a missing AMI fails before any
// resource is created.

interface ProbeInputs {
  readonly region: string;
  readonly amiId: string;
  readonly hostname: string;
}

const resolveInputs = (env: Record<string, string | undefined>): ProbeInputs => {
  const region = env.ANDROID_PREVIEW_REGION ?? PROBE_DEFAULT_REGION;
  const amiId = env.ANDROID_PREVIEW_AMI_ID;
  const hostname = env.ANDROID_PREVIEW_PROBE_HOSTNAME;
  if (!amiId) {
    throw new Error(
      `ANDROID_PREVIEW_AMI_ID is required. Resolve the Amazon Linux 2023 x86_64 AMI for ${region} ` + "and pin it; the probe must record the image it actually ran.",
    );
  }
  if (!hostname) {
    throw new Error(
      "ANDROID_PREVIEW_PROBE_HOSTNAME is required, for example android-probe.example.com. " + "The tunnel routes this hostname to the host's loopback bridge.",
    );
  }
  return { region, amiId, hostname };
};

const inputs = resolveInputs(process.env);
const template = buildProbeTemplate({
  amiId: inputs.amiId,
  region: inputs.region,
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

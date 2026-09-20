import * as Alchemy from "alchemy";
import * as AWS from "alchemy/AWS";
import * as Cloudflare from "alchemy/Cloudflare";
import { Effect, Layer } from "effect";
import { STACK } from "../identity.ts";

// Disposable transfer bucket for Phase 0. The final publication service owns
// R2 artifacts; this bucket is independently destroyed after the probe.
process.env.AWS_REGION = process.env.ANDROID_PREVIEW_REGION;
export default Alchemy.Stack(
  `${STACK}AndroidProbeArtifacts`,
  {
    providers: Layer.mergeAll(Cloudflare.providers(), AWS.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stack = yield* AWS.CloudFormation.Stack("artifacts", {
      stackName: `${STACK}-android-probe-artifacts`,
      templateBody: JSON.stringify({
        AWSTemplateFormatVersion: "2010-09-09",
        Resources: {
          Artifacts: {
            Type: "AWS::S3::Bucket",
            Properties: {
              PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
              BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] },
              LifecycleConfiguration: { Rules: [{ Id: "ExpireProbeArtifacts", Status: "Enabled", ExpirationInDays: 1 }] },
              Tags: [{ Key: "proof:component", Value: "android-preview-probe" }],
            },
          },
        },
        Outputs: { BucketName: { Value: { Ref: "Artifacts" } } },
      }),
    });
    return { bucketName: stack.outputs.BucketName };
  }),
);

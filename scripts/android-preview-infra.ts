#!/usr/bin/env bun
import { Schema } from "effect";

// Alchemy's AWS provider accepts environment credentials, while the AWS CLI
// knows how to resolve profiles/SSO. Bridge them without printing or persisting
// credentials or changing the owner's profile.
const credentialsSchema = Schema.Struct({ AccessKeyId: Schema.String, SecretAccessKey: Schema.String, SessionToken: Schema.optional(Schema.String) });
const credentialResult = Bun.spawnSync(["aws", "configure", "export-credentials", "--format", "process"], { stdout: "pipe", stderr: "inherit" });
if (credentialResult.exitCode !== 0) throw new Error("AWS CLI could not resolve credentials. Configure the owner's AWS profile first.");
const credentials = Schema.decodeUnknownSync(credentialsSchema)(JSON.parse(credentialResult.stdout.toString()));
const operation = process.argv[2];
if (operation !== "deploy" && operation !== "destroy") throw new Error("Usage: bun scripts/android-preview-infra.ts deploy|destroy");
const stack = process.argv[3] === "artifacts" ? "stacks/android-preview-artifacts.ts" : "stacks/android-preview-probe.ts";
const child = Bun.spawn(["bunx", "alchemy", operation, stack, "--stage", "probe", "--yes"], {
  env: {
    ...process.env,
    AWS_ACCESS_KEY_ID: credentials.AccessKeyId,
    AWS_SECRET_ACCESS_KEY: credentials.SecretAccessKey,
    ...(credentials.SessionToken ? { AWS_SESSION_TOKEN: credentials.SessionToken } : {}),
  },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(await child.exited);

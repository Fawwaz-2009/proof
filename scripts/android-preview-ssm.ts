#!/usr/bin/env bun
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Schema } from "effect";

const [instanceId, file] = process.argv.slice(2);
if (!instanceId || !/^i-[a-f0-9]+$/.test(instanceId) || !file) throw new Error("Usage: bun scripts/android-preview-ssm.ts <instance-id> <script.sh>");
const region = process.env.ANDROID_PREVIEW_REGION;
if (!region) throw new Error("ANDROID_PREVIEW_REGION is required");
const aws = (args: string[]) => {
  const result = Bun.spawnSync(["aws", ...args, "--region", region, "--output", "json"], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return JSON.parse(result.stdout.toString());
};
const dir = mkdtempSync(join(tmpdir(), "proof-ssm-"));
try {
  const payload = Buffer.from(readFileSync(file)).toString("base64");
  const parameters = join(dir, "parameters.json");
  writeFileSync(
    parameters,
    JSON.stringify({
      commands: [`umask 077; script=$(mktemp /tmp/proof-command.XXXXXX); trap 'rm -f "$script"' EXIT; printf '%s' '${payload}' | base64 -d > "$script"; bash "$script"`],
      executionTimeout: ["900"],
    }),
    { mode: 0o600 },
  );
  const response = Schema.decodeUnknownSync(Schema.Struct({ Command: Schema.Struct({ CommandId: Schema.String }) }))(
    aws([
      "ssm",
      "send-command",
      "--instance-ids",
      instanceId,
      "--document-name",
      "AWS-RunShellScript",
      "--timeout-seconds",
      "60",
      "--parameters",
      `file://${parameters}`,
    ]),
  );
  const id = response.Command.CommandId;
  console.log(`SSM command ${id}`);
  const deadline = Date.now() + 960_000;
  while (Date.now() < deadline) {
    await Bun.sleep(5000);
    const result = Schema.decodeUnknownSync(Schema.Struct({ Status: Schema.String, StandardOutputContent: Schema.String, StandardErrorContent: Schema.String }))(
      aws(["ssm", "get-command-invocation", "--command-id", id, "--instance-id", instanceId]),
    );
    if (["Pending", "InProgress", "Delayed"].includes(result.Status)) continue;
    console.log(result.StandardOutputContent);
    if (result.StandardErrorContent) console.error(result.StandardErrorContent);
    if (result.Status !== "Success") throw new Error(`SSM ${result.Status}`);
    process.exitCode = 0;
    break;
  }
  if (Date.now() >= deadline) {
    aws(["ssm", "cancel-command", "--command-id", id, "--instance-ids", instanceId]);
    throw new Error("SSM deadline exceeded; command cancelled");
  }
} finally {
  rmSync(dir, { recursive: true });
}

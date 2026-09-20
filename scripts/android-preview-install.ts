#!/usr/bin/env bun
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { Schema } from "effect";
import { STACK } from "../identity.ts";
import { bundleIdentifierFor, resolveEnv, resolveIdentity } from "./env.ts";
import { loadProbeOutputs } from "./android-preview-outputs.ts";

const apk = resolve(process.argv[2] ?? "apps/mobile/android/app/build/outputs/apk/release/app-release.apk");
if (!(await Bun.file(apk).exists())) throw new Error("Build the browser APK before installing it.");
const output = await loadProbeOutputs();
const run = (args: string[]) => {
  const result = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`${args[0]} ${args[1]} failed: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
};
const aws = (args: string[]) => run(["aws", ...args, "--region", output.region]);
const bucket = Schema.decodeUnknownSync(Schema.String)(
  JSON.parse(
    aws([
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      `${STACK}-android-probe-artifacts`,
      "--query",
      "Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue | [0]",
      "--output",
      "json",
    ]),
  ),
);
const appId = bundleIdentifierFor(resolveIdentity(resolveEnv([".env"])), "preview");
if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(appId)) throw new Error("Invalid Android package identity");
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
const dir = mkdtempSync(join(tmpdir(), "proof-preview-install-"));
try {
  const archive = join(dir, "recipe.tar.gz");
  run(["tar", "czf", archive, "-C", "containers/android-preview", "."]);
  aws(["s3", "cp", apk, `s3://${bucket}/probe/app-release.apk`, "--only-show-errors"]);
  aws(["s3", "cp", archive, `s3://${bucket}/probe/recipe.tar.gz`, "--only-show-errors"]);
  const apkUrl = aws(["s3", "presign", `s3://${bucket}/probe/app-release.apk`, "--expires-in", "900"]);
  const recipeUrl = aws(["s3", "presign", `s3://${bucket}/probe/recipe.tar.gz`, "--expires-in", "900"]);
  const digest = new Bun.CryptoHasher("sha256").update(await Bun.file(apk).arrayBuffer()).digest("hex");
  const script = join(dir, "install.sh");
  writeFileSync(
    script,
    [
      "set -euo pipefail",
      "umask 077",
      "install -d -m 700 /etc/proof-preview",
      `printf %s ${quote(output.tunnelToken.__redacted__)} > /etc/proof-preview/tunnel-token`,
      "install -d /opt/proof-preview-recipe",
      `curl -fLsS ${quote(recipeUrl)} | tar xz -C /opt/proof-preview-recipe`,
      "cd /opt/proof-preview-recipe",
      "bash harden.sh",
      `curl -fLsS ${quote(apkUrl)} -o /tmp/proof-preview.apk`,
      `echo ${quote(digest + "  /tmp/proof-preview.apk")} | sha256sum -c -`,
      "chmod 644 /tmp/proof-preview.apk",
      "runuser -u android -- /opt/android-sdk/platform-tools/adb install -r /tmp/proof-preview.apk",
      "rm -f /tmp/proof-preview.apk",
      `ANDROID_APP_ID=${quote(appId)} bash install-reviewer.sh`,
      "bash connect.sh",
    ].join("\n"),
    { mode: 0o600 },
  );
  const child = Bun.spawn(["bun", "scripts/android-preview-ssm.ts", output.instanceId, script], { stdout: "inherit", stderr: "inherit" });
  const code = await child.exited;
  if (code !== 0) throw new Error("Remote preview installation failed");
  console.log(`Installed APK sha256=${digest}; reviewer=https://${output.hostname}/`);
} finally {
  rmSync(dir, { recursive: true });
}

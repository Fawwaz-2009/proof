// Run EAS CLI with apps/mobile/.env loaded.
//
// Why a wrapper: EAS reads the app config, and the app config derives the
// project link and identity from the environment (EAS_PROJECT_ID, APP_SLUG,
// APP_NAME, ROOT_DOMAIN). Bun loads .env for scripts it executes itself, but a
// spawned binary does not inherit those values, so every local EAS command
// would run against an unlinked project. This wrapper reads the file and hands
// the child a complete environment.
//
//    bun run eas build:list --limit 1
//    bun run eas credentials
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(root, "apps/mobile");
const envPath = join(appDir, ".env");

const env: NodeJS.ProcessEnv = { ...process.env };

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    const key = match?.[1];
    const value = match?.[2]?.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    if (key !== undefined && value !== undefined) env[key] = value;
  }
}

const binary = join(root, "node_modules", ".bin", "eas");
const result = spawnSync(binary, process.argv.slice(2), { stdio: "inherit", env, cwd: appDir });
process.exit(result.status ?? 1);

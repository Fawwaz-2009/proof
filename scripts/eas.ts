// Run EAS CLI with apps/mobile/.env loaded, explicit values winning.
//
// Why a wrapper: EAS reads the app config, and the app config derives the
// project link and identity from the environment (EAS_PROJECT_ID, APP_SLUG,
// APP_NAME, ROOT_DOMAIN). Bun loads .env for scripts it executes itself, but a
// spawned binary does not inherit those values, so every local EAS command
// would run against an unlinked project.
//
// Precedence is the repository rule (scripts/env.ts): values already in the
// process environment win, the file only supplies defaults. CI passes the PR
// API URL this way, and a local .env must never overwrite it.
//
//    bun run eas build:list --limit 1
//    bun run eas credentials
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveEnv } from "./env.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(root, "apps/mobile");

const env = resolveEnv([join(appDir, ".env")]);
// The child env type requires NODE_ENV; supply the conventional default.
const childEnv: NodeJS.ProcessEnv = { NODE_ENV: "development", ...env };

const binary = join(root, "node_modules", ".bin", "eas");
const result = spawnSync(binary, process.argv.slice(2), { stdio: "inherit", env: childEnv, cwd: appDir });
process.exit(result.status ?? 1);

#!/usr/bin/env bun
/**
 * create-alchemy-flare: scaffold a new product from this template.
 *
 *   bunx github:<you>/alchemy-flare my-app      # once this repo is pushed
 *   bun scripts/create-alchemy-flare.ts my-app  # or straight from a clone
 *
 * What it does:
 *   1. copies the template into a new directory (no .git, no node_modules,
 *      no .env, no build output)
 *   2. renames the four identity tokens (alchemy-flare / AlchemyFlare /
 *      Alchemy Flare / @alchemy-flare/*) to your product
 *   3. assigns fresh rate-limit namespace ids (they are account-global:
 *      sharing them shares abuse counters with every app on the account)
 *   4. rewrites the generated README's tail and gives the app a fresh,
 *      single-commit git history
 *   5. installs dependencies and prints the day-0 runbook
 */
import { $ } from "bun";
import { createInterface } from "node:readline/promises";
import { randomInt } from "node:crypto";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const TEMPLATE_NAME = "alchemy-flare";
const REPO_ROOT = resolve(import.meta.dir, "..");

// ---------- args + prompts ----------

const flags = new Map<string, string>();
const positional: string[] = [];
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]!;
  if (arg.startsWith("--")) {
    flags.set(arg.slice(2), process.argv[i + 1] ?? "");
    i++;
  } else {
    positional.push(arg);
  }
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (question: string) => (await rl.question(question)).trim();

let dir = positional[0] ?? "";
if (!dir) dir = await ask("Project name (used as the directory): ");
dir = dir.trim();
if (!dir) {
  console.error("error: a project name is required");
  process.exit(1);
}

const slug = (flags.get("slug") ?? dir)
  .toLowerCase()
  .replace(/[^a-z0-9-]+/g, "-")
  .replace(/^-+|-+$/g, "");
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  console.error(`error: "${slug}" is not a valid package slug (lowercase letters, digits, dashes)`);
  process.exit(1);
}

const display = flags.get("display") ?? slug.split("-").map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part)).join(" ");
const pascal = display.replace(/[^A-Za-z0-9]+/g, "");

const target = resolve(process.cwd(), dir);
if (existsSync(target) && readdirSync(target).length > 0) {
  console.error(`error: ${target} already exists and is not empty`);
  process.exit(1);
}

// ---------- copy ----------

const SKIP_DIRS: Record<string, true> = { ".git": true, ".claude": true, ".wrangler": true, "node_modules": true, "dist": true, "temp": true, ".omp": true };
const SKIP_FILES: Record<string, true> = { ".env": true, "bun.lock": true, "create-alchemy-flare.ts": true };
const BINARY_EXT: Record<string, true> = { ".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true, ".ico": true, ".woff": true, ".woff2": true };

console.log(`scaffolding ${display} (<${slug}>) into ${target} ...`);
cpSync(REPO_ROOT, target, {
  recursive: true,
  filter: (src) => !(basename(src) in SKIP_DIRS) && !(basename(src) in SKIP_FILES),
});

// ---------- rename the identity tokens ----------

/** Case-sensitive, longest-first so `Alchemy Flare` never half-matches `alchemy-flare`. */
const TOKENS: Array<[string, string]> = [
  ["Alchemy Flare", display],
  ["AlchemyFlare", pascal],
  ["alchemy-flare", slug],
];

const walk = (root: string): string[] =>
  readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = join(root, entry.name);
    if (entry.isDirectory()) return entry.name in SKIP_DIRS ? [] : walk(full);
    if (entry.name in SKIP_FILES) return [];
    if (entry.name.slice(entry.name.lastIndexOf(".")) in BINARY_EXT) return [];
    return [full];
  });

let renamed = 0;
for (const file of walk(target)) {
  const before = readFileSync(file, "utf8");
  const after = TOKENS.reduce((text, [from, to]) => text.replaceAll(from, to), before);
  if (after !== before) {
    writeFileSync(file, after);
    renamed++;
  }
}

// ---------- fresh rate-limit namespace ids (account-global: never share) ----------

const rateLimitFile = join(target, "apps/backend/config/rate-limit.ts");
const globalId = randomInt(1000, 10000);
let authId = randomInt(1000, 10000);
if (authId === globalId) authId = ((authId - 1000 + 1) % 9000) + 1000;
const rateLimit = readFileSync(rateLimitFile, "utf8")
  .replaceAll("namespaceId: 9001", `namespaceId: ${globalId}`)
  .replaceAll("namespaceId: 9002", `namespaceId: ${authId}`)
  .replaceAll(`${globalId}/${globalId} belong`, `${globalId}/${authId} belong`)
  .replaceAll("9001/9002 belong", `${globalId}/${authId} belong`);
writeFileSync(rateLimitFile, rateLimit);

// ---------- generated README tail + drop the CLI from the product ----------

const readmeFile = join(target, "README.md");
const readme = readFileSync(readmeFile, "utf8");
const renameSection = readme.indexOf("## Renaming for a new product");
const readmeTail = `## Scaffolded by create-alchemy-flare

Generated as **${display}** (\`${slug}\`): packages \`@${slug}/*\`, stack \`${pascal}\`,
fresh rate-limit namespace ids in \`config/rate-limit.ts\`, fresh single-commit
git history. The \`scripts/\` folder and \`bin\` field from the template are not
part of your app.

\`\`\`sh
cp .env.example .env
bun run dev                              # local: both Workers, emulated D1/R2
bunx alchemy deploy --stage preview-1    # live preview URL
\`\`\`

The first deploy provisions D1, R2, and email, so give it a few minutes.
Deploys after that are fast. See "Local development" and "Deploying" above.
`;
writeFileSync(readmeFile, renameSection === -1 ? readme + "\n" + readmeTail : readme.slice(0, renameSection) + readmeTail);
rmSync(join(target, "scripts"), { recursive: true, force: true });

const pkgFile = join(target, "package.json");
const pkg = JSON.parse(readFileSync(pkgFile, "utf8")) as { bin?: unknown };
delete pkg.bin;
writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + "\n");

// ---------- fresh git history + install ----------

await $`git init -b main`.cwd(target).quiet();
await $`git add -A`.cwd(target).quiet();
await $`git -c user.name=${display} -c user.email=scaffold@${slug}.local commit -m "Scaffold ${slug} from ${TEMPLATE_NAME}"`.cwd(target).quiet();
console.log("installing dependencies ...");
await $`bun install`.cwd(target).quiet();

// ---------- alchemy prerequisite check (detect + instruct, never automate) ----------

const hasEnvCredentials = !!(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
const hasAlchemyLogin = existsSync(join(homedir(), ".alchemy"));
const alchemyNote = hasEnvCredentials || hasAlchemyLogin
  ? null
  : `
  NOTE: no Alchemy/Cloudflare credentials detected.
  - Local dev works after:  alchemy login   (or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in .env)
  - Deploys that PROVISION need the API-token login: OAuth cannot mint.
    Create a Cloudflare API token, then: alchemy login (choose API token)
    This is its own ceremony; do it once per machine.`;

// ---------- runbook ----------

const agentPrompt = `Wire continuous deployment for this alchemy-flare app:
- Every PR: GitHub Actions runs bun run check, then deploys a preview stage
  (bunx alchemy deploy --stage pr-<number>), posts the preview URL, and
  destroys the stage when the PR closes.
- Merges to main deploy prod (bunx alchemy deploy --stage prod).
Follow the README (Verification gate, Deploying). I will complete the
Alchemy/Cloudflare token ceremonies (API-token login, trust root) when you ask.`;

console.log(`
  ${display} is ready.

  cd ${basename(target)}

  1. cp .env.example .env        # configure sender + credentials
  2. bun run dev                 # zero-to-local, emulated D1/R2
  3. bunx alchemy deploy --stage preview-1
                                 # zero-to-preview: one command, one URL
                                 # (first run provisions: expect a few minutes)

${alchemyNote ?? ""}

  When you want PR previews + prod CD, paste this into your coding agent:

--- copy ---
${agentPrompt}
---
`);
rl.close();

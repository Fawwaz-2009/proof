import * as fs from "node:fs";
import * as path from "node:path";
import { run } from "./shell.ts";

// template source, resolved for both run modes:
//   repo checkout:  packages/create-starting-flare/src -> the repo root
//   installed pkg:  <pkg>/src -> <pkg>/template (synced at publish time)
const devRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const packedRoot = path.resolve(import.meta.dirname, "..", "template");
export const TEMPLATE_ROOT = fs.existsSync(path.join(devRoot, "alchemy.run.ts")) ? devRoot : packedRoot;

export const COPY_DENYLIST = new Set([
  ".git",
  ".env",
  ".claude",
  ".omp",
  ".alchemy",
  ".wrangler",
  ".tanstack",
  ".output",
  "node_modules",
  "bun.lock",
  "packages", // the scaffolding tool itself never ships in the product
  "dist",
  "temp",
  ".DS_Store",
]);

// intentional: detects binary files so the rename pass can skip them
const CONTROL_RE = /[\0\x08\x0e-\x1f]/;

export const copyTemplate = (from: string, to: string): void => {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (COPY_DENYLIST.has(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyTemplate(src, dst);
    else fs.copyFileSync(src, dst);
  }
};

/**
 * The rename surface: four identity tokens, one pass, most-specific first.
 * Order matters: "Starting Flare" and "StartingFlare" before the bare slug,
 * the package scope before the bare slug. Rate-limit namespace ids are
 * account-global, so the scaffold claims fresh ones.
 */
const renameIdentity = (root: string, slug: string, display: string): void => {
  const pascal = display.replace(/[^a-zA-Z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ""));
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(file);
        continue;
      }
      let content: string;
      try {
        content = fs.readFileSync(file, "utf8");
      } catch {
        continue; // unreadable: leave untouched
      }
      if (CONTROL_RE.test(content)) continue; // binary-ish: leave untouched
      let next = content
        .replaceAll("Starting Flare", display)
        .replaceAll("StartingFlare", pascal)
        .replaceAll("@starting-flare/", `@${slug}/`)
        .replaceAll("starting-flare", slug);
      if (file.endsWith(path.join("apps", "backend", "config", "rate-limit.ts"))) {
        const fresh = (): number => 10000 + Math.floor(Math.random() * 80000);
        next = next.replaceAll("namespaceId: 9001", `namespaceId: ${fresh()}`).replaceAll("namespaceId: 9002", `namespaceId: ${fresh()}`);
      }
      if (next !== content) fs.writeFileSync(file, next);
    }
  };
  walk(root);

  // the copied root package.json must not carry the scaffolding bin or the
  // excluded packages workspace (they point at files that do not ship)
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { bin?: unknown; workspaces?: Array<string> };
  delete pkg.bin;
  pkg.workspaces = (pkg.workspaces ?? []).filter((w) => w !== "packages/*");
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
};

export const scanLeftovers = (root: string): Array<string> => {
  const leftovers: Array<string> = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (COPY_DENYLIST.has(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(file);
        continue;
      }
      let content: string;
      try {
        content = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      if (/starting[\s_-]?flare/i.test(content)) leftovers.push(path.relative(root, file));
    }
  };
  walk(root);
  return leftovers;
};

export type EnvValues = {
  domain: string;
  sender: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  owner: string;
  repo: string;
};

const writeEnv = (root: string, v: EnvValues): void => {
  const lines = [
    "# Written by create-starting-flare. Local development needs nothing here;",
    "# these values drive deploys and the ceremony (stacks/github.ts).",
    `ROOT_DOMAIN=${v.domain}`,
    `AUTH_EMAIL_FROM=${v.sender}`,
    `R2_ACCESS_KEY_ID=${v.r2AccessKeyId}`,
    `R2_SECRET_ACCESS_KEY=${v.r2SecretAccessKey}`,
    "# Ceremony inputs (rerun: bunx alchemy deploy stacks/github.ts --profile admin --stage bootstrap --yes)",
    `GITHUB_OWNER=${v.owner}`,
    `GITHUB_REPO=${v.repo}`,
    "",
  ];
  fs.writeFileSync(path.join(root, ".env"), lines.join("\n"));
};

/** Copy, rename, write .env, fresh git history. The whole local scaffold. */
export const scaffold = (templateRoot: string, target: string, answers: { slug: string; display: string }, env: EnvValues | null): Array<string> => {
  copyTemplate(templateRoot, target);
  renameIdentity(target, answers.slug, answers.display);
  if (env) writeEnv(target, env);
  for (const cmd of [
    ["init", "-b", "main"],
    ["add", "-A"],
    ["commit", "-m", `Scaffold ${answers.display} from starting-flare`, "--quiet"],
  ]) {
    const r = run("git", cmd, { cwd: target });
    if (!r.ok) throw new Error(`git ${cmd[0]} failed: ${r.stderr}`);
  }
  return scanLeftovers(target);
};

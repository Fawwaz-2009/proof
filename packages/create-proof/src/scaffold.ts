import * as fs from "node:fs";
import * as path from "node:path";
import { run } from "./shell.ts";

// template source, resolved for both run modes:
//   repo checkout:  packages/create-proof/src -> the repo root
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
const CONTROL_RE = /[\0\x08\x0e-\x1f]/; // oxlint-disable-line eslint/no-control-regex

export const copyTemplate = (from: string, to: string): void => {
  fs.mkdirSync(to, { recursive: true });
  const resolvedTo = path.resolve(to);
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (COPY_DENYLIST.has(entry.name)) continue;
    const src = path.join(from, entry.name);
    // The target may sit inside the source (a relative target resolved
    // against the repo root): never walk into it, that recursion copies
    // the copy into itself until paths exceed the OS limit.
    if (path.resolve(src) === resolvedTo) continue;
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyTemplate(src, dst);
    else fs.copyFileSync(src, dst);
  }
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Identity positions only: the package scope and the stack literal. */
const replaceScopeAndStack = (content: string, slug: string, pascal: string): string =>
  content.replaceAll(`"StartingFlare"`, `"${pascal}"`).replaceAll("@proof/", `@${slug}/`);

/**
 * The full transform for code and config: every brand token becomes the
 * new product's, in ONE pass. A single alternation regex matters: slugs
 * legitimately contain the brand slug (scaffolding "proof-smoke" from
 * "proof"), and chained replaceAll calls would re-hit their own output.
 * Matched tokens, longest first: the package scope, the quoted stack
 * literal, the PascalCase brand, the bare slug. Rate-limit namespace ids
 * are account-global, so the scaffold claims fresh ones.
 */
const replaceIdentity = (content: string, slug: string, pascal: string): string => {
  const pattern = [`@proof/`, `"StartingFlare"`, `Proof`, `proof`].map(escapeRegex).join("|");
  let next = content.replace(new RegExp(pattern, "g"), (match) => {
    if (match === "@proof/") return `@${slug}/`;
    if (match === '"StartingFlare"') return `"${pascal}"`;
    if (match === "Proof") return pascal;
    return slug;
  });
  if (content.includes("namespaceId: 9001")) {
    const fresh = (): number => 10000 + Math.floor(Math.random() * 80000);
    next = next.replaceAll("namespaceId: 9001", `namespaceId: ${fresh()}`).replaceAll("namespaceId: 9002", `namespaceId: ${fresh()}`);
  }
  return next;
};

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
      // Prose speaks about the template, so the brand word survives in
      // markdown; only true identity positions rename.
      const next = file.endsWith(".md") ? replaceScopeAndStack(content, slug, pascal) : replaceIdentity(content, slug, pascal);
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
  appName: string;
  slug: string;
  domain: string;
  sender: string;
  owner: string;
  repo: string;
};

const writeEnv = (root: string, v: EnvValues): void => {
  const lines = [
    "# Written by create-proof. Local development needs nothing here;",
    "# these values drive deploys and the ceremony (stacks/github.ts).",
    `APP_NAME=${v.appName}`,
    `APP_SLUG=${v.slug}`,
    `ROOT_DOMAIN=${v.domain}`,
    `AUTH_EMAIL_FROM=${v.sender}`,
    "# Ceremony inputs (rerun: bunx alchemy deploy stacks/github.ts --profile admin --stage bootstrap --yes)",
    `GITHUB_OWNER=${v.owner}`,
    `GITHUB_REPO=${v.repo}`,
    "",
  ];
  fs.writeFileSync(path.join(root, ".env"), lines.join("\n"));
};

/** The starter landing: shipped in the package, swapped over the storefront at scaffold time. */
const starterIndex = path.resolve(import.meta.dirname, "..", "scaffold", "index.tsx");

/** Copy, rename, swap the starter page, write .env, fresh git history. The whole local scaffold. */
export const scaffold = (templateRoot: string, target: string, answers: { slug: string; display: string }, env: EnvValues | null): Array<string> => {
  copyTemplate(templateRoot, target);
  const pascal = answers.display.replace(/[^a-zA-Z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ""));
  renameIdentity(target, answers.slug, answers.display);

  // The storefront landing belongs to this repository's own deploy only.
  // The swap runs at pack time for the tarball and here for dev-mode
  // scaffolds (which copy the repo root, not the snapshot).
  const routesDir = path.join(target, "apps", "web", "src", "routes");
  fs.mkdirSync(routesDir, { recursive: true });
  fs.writeFileSync(path.join(routesDir, "index.tsx"), replaceScopeAndStack(fs.readFileSync(starterIndex, "utf8"), answers.slug, pascal));

  if (env) writeEnv(target, env);
  for (const cmd of [
    ["init", "-b", "main"],
    ["add", "-A"],
    ["commit", "-m", `Scaffold ${answers.display} from proof`, "--quiet"],
  ]) {
    const r = run("git", cmd, { cwd: target });
    if (!r.ok) throw new Error(`git ${cmd[0]} failed: ${r.stderr}`);
  }
  return scanLeftovers(target);
};

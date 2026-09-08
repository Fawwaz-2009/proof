#!/usr/bin/env bun
/**
 * Parallel development, one command: `bun scripts/wt.ts <name>`.
 *
 * Creates a git worktree for an agent or a developer, copies `.env` into it
 * (untracked files do not follow branches), installs dependencies, and prints
 * the exact commands. Each worktree runs its OWN stage (`dev-<name>`): its
 * own D1, R2 bucket, and deterministic dev port, so two worktrees can never
 * collide, and every branch's PR gets its own `pr-N` preview.
 *
 * Agents: everything you need is printed at the end and documented in
 * AGENTS.md ("Worktrees"). If `.env` changes in the main checkout, re-copy
 * it here (`cp ../../<repo>/.env .env` from the worktree).
 *
 * Usage:
 *   bun scripts/wt.ts feature-x           # create ../<repo>-wt/feature-x
 *   bun scripts/wt.ts feature-x --no-install   # skip bun install
 *   bun scripts/wt.ts --list              # list existing worktrees
 *   bun scripts/wt.ts --remove <name>     # remove a worktree + its branch
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

type Run = { ok: boolean; stdout: string; stderr: string };

const run = (cmd: string, args: Array<string>, cwd?: string): Run => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  return { ok: r.status === 0, stdout: (r.stdout ?? "").trim(), stderr: (r.stderr ?? "").trim() };
};

const die = (message: string): never => {
  console.error(`x ${message}`);
  process.exit(1);
};

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  console.log("usage: bun scripts/wt.ts <name> [--no-install]\n" + "       bun scripts/wt.ts --list\n" + "       bun scripts/wt.ts --remove <name>");
  process.exit(0);
}

const repoRoot = run("git", ["rev-parse", "--show-toplevel"]);
if (!repoRoot.ok) die("Not inside a git repository. Run this from the project checkout.");
const root = repoRoot.stdout;
const repoSlug = path.basename(root);

if (argv.includes("--list")) {
  const list = run("git", ["worktree", "list"]);
  console.log(list.stdout || "(no worktrees)");
  process.exit(0);
}

const removeIndex = argv.indexOf("--remove");
if (removeIndex !== -1) {
  const name = argv[removeIndex + 1] ?? die("--remove needs the worktree name.");
  const wtPath = path.join(path.dirname(root), `${repoSlug}-wt`, name);
  const removed = run("git", ["worktree", "remove", "--force", wtPath]);
  if (!removed.ok) die(`Could not remove ${wtPath}: ${removed.stderr}`);
  run("git", ["branch", "-D", name]); //best effort; the branch may be merged
  console.log(`removed ${wtPath} and branch ${name}`);
  process.exit(0);
}

const name = argv.find((a) => !a.startsWith("--")) ?? die("Give the worktree a name: bun scripts/wt.ts feature-x");
if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
  die(`Invalid name "${name}": lowercase letters, digits and dashes only.`);
}
if (["main", "master"].includes(name)) die(`"${name}" is the main branch; pick another name.`);
const noInstall = argv.includes("--no-install");

const wtPath = path.join(path.dirname(root), `${repoSlug}-wt`, name);
const branch = name;
const stage = `dev-${name}`;

fs.mkdirSync(path.dirname(wtPath), { recursive: true });
const created = run("git", ["worktree", "add", wtPath, "-b", branch]);
if (!created.ok) {
  die(`git worktree add failed: ${created.stderr}\n` + `  If branch "${branch}" already exists: bun scripts/wt.ts --remove ${name}, or pick another name.`);
}

//untracked files do not follow branches: bring the environment along
const envSrc = path.join(root, ".env");
if (fs.existsSync(envSrc)) {
  fs.copyFileSync(envSrc, path.join(wtPath, ".env"));
}

let installNote = "install skipped (--no-install)";
if (!noInstall) {
  const install = run("bun", ["install"], wtPath);
  installNote = install.ok ? "dependencies installed" : `bun install FAILED:\n${install.stderr}`;
}

console.log(
  [
    "",
    `  worktree  ${path.relative(process.cwd(), wtPath)}  (branch ${branch})`,
    `  stage     ${stage}: own D1, R2 bucket, deterministic port`,
    `  env       ${fs.existsSync(envSrc) ? ".env copied from the main checkout" : "no root .env to copy"}`,
    `  install   ${installNote}`,
    "",
    "  Work in it:",
    "",
    `    cd ${wtPath}`,
    `    bun run dev --stage ${stage}      # both Workers; NEVER bare \`bun run dev\` here`,
    "    bun run check                     # same gates as main",
    "",
    "  Commit and open a PR from here as usual; the PR gets its own pr-N preview",
    "  (URL posted on the PR). When done: bun scripts/wt.ts --remove " + name,
    "",
  ].join("\n"),
);

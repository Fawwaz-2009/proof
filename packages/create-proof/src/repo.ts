import { run, type Run } from "./shell.ts";

export const ghOwner = (): string => {
  const r = run("gh", ["api", "user", "--jq", ".login"]);
  if (!r.ok) throw new Error("Could not resolve the GitHub login. Run: gh auth login");
  return r.stdout;
};

export const ghToken = (): string => {
  const r = run("gh", ["auth", "token"]);
  if (!r.ok) throw new Error("Could not read the GitHub token (gh auth token failed).");
  return r.stdout;
};

export const repoExists = (full: string): boolean => run("gh", ["repo", "view", full, "--json", "name", "--jq", ".name"]).ok;

/** Creates the repo from the target checkout and pushes main. */
export const createRepo = (full: string, isPublic: boolean, cwd: string): Run =>
  run("gh", ["repo", "create", full, isPublic ? "--public" : "--private", "--source", ".", "--remote", "origin", "--push"], { cwd });

/** Adopts an existing repo: wire the remote and push main. */
export const adoptRepo = (full: string, cwd: string): { remote: Run; push: Run } => {
  const remote = run("git", ["remote", "add", "origin", `https://github.com/${full}.git`], { cwd });
  const push = run("git", ["push", "-u", "origin", "main"], { cwd });
  return { remote, push };
};

/**
 * The ceremony: the stack mints the least-privilege CI token and writes
 * every repo secret, reading all values from .env (alchemy auto-loads it).
 * Runs with the admin profile written by resolveAdmin.
 */
export const runCeremony = (cwd: string, githubToken: string): Run =>
  run("bunx", ["alchemy", "deploy", "stacks/github.ts", "--profile", "admin", "--stage", "bootstrap", "--yes"], {
    cwd,
    env: { GITHUB_TOKEN: githubToken, CI: "true" },
  });

export const listSecrets = (full: string): Set<string> => {
  const r = run("gh", ["secret", "list", "-R", full, "--json", "name", "--jq", ".[].name"]);
  if (!r.ok) throw new Error(`Could not list repo secrets: ${r.stderr}`);
  return new Set(r.stdout.split("\n"));
};

export const expectedSecrets = (): Array<string> => [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "ROOT_DOMAIN",
  "AUTH_EMAIL_FROM",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
];

/** Branch first-light + the empty marker commit + push + PR. Returns the PR URL. */
export const openMarkerPr = (cwd: string, body: string): string => {
  for (const cmd of [
    ["checkout", "-b", "first-light"],
    ["commit", "--allow-empty", "-m", "first light", "--quiet"],
    ["push", "-u", "origin", "first-light"],
  ]) {
    const r = run("git", cmd, { cwd });
    if (!r.ok) throw new Error(`git ${cmd[0]} failed: ${r.stderr}`);
  }
  const pr = run("gh", ["pr", "create", "--base", "main", "--head", "first-light", "--title", "First light", "--body", body], { cwd });
  if (!pr.ok) throw new Error(`gh pr create failed: ${pr.stderr}`);
  return pr.stdout.split("\n").at(-1) ?? "";
};

export const markerPrBody = (slug: string, domain: string, sender: string): string =>
  [
    "## First light",
    "",
    "The scaffold is live. This PR proves the pipeline end to end: opening it",
    "deploys an isolated `pr-1` preview stage and posts its URL as a comment.",
    "",
    "## One step before merging",
    "",
    "Merging arms production, which sends real email. Create the sender first:",
    "",
    "1. Cloudflare dashboard, Email > Email Routing > Destination addresses:",
    `   add \`${sender}\` and click the verification link in that inbox.`,
    '2. Mark "Prod readiness" as a required status check:',
    "   Settings > Branches > Branch protection for `main`.",
    "",
    "## After merge",
    "",
    `- prod deploys to https://${slug}.${domain} (migrations ride the deploy)`,
    "- sign in with a real email: the peace sign that prod works",
    "",
    "Closing this PR destroys the preview stage automatically.",
  ].join("\n");

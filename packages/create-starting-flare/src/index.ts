#!/usr/bin/env bun
/**
 * create-starting-flare: scaffold a new product from this template.
 *
 *   bunx github:Fawwaz-2009/starting-flare my-app
 *
 * Design constraints (do not relax them casually):
 *
 * - ZERO npm dependencies. The command runs straight from a GitHub checkout
 *   (`bunx github:...`), so every capability comes from Bun or Node builtins.
 *   A dependency here is an install step that can break the front door.
 * - The template source is the checkout the CLI itself runs from: bunx
 *   downloads the whole repository, so `TEMPLATE_ROOT` (three levels up from
 *   this file) is the copy source. No network clone, no git needed to fetch.
 * - Fresh history by construction: files are COPIED, then `git init` runs in
 *   the target. The template's commits never transfer.
 * - Self-exclusion: the copy filter drops this package, so a scaffolded app
 *   never carries the scaffolding tool.
 * - Every external effect is verified before the next step runs (token probe
 *   before the ceremony, secret list after it). No silent failures.
 *
 * Flow: prereqs -> admin credential (reuse stored profile or guided mint) ->
 * prompts -> copy + rename + fresh git -> bun install -> GitHub repo ->
 * ceremony (mint CI token + write repo secrets, driven by .env) -> marker PR
 * with the remaining-setup checklist.
 *
 * Flags (for agents; every prompt has a flag or env equivalent):
 *   my-app                  target directory (positional, required)
 *   --domain <d>            ROOT_DOMAIN: a zone on the Cloudflare account
 *   --r2-access-key-id, --r2-secret-access-key   R2 S3 credentials (Object Read)
 *   --display <name>        product display name (default: title-cased slug)
 *   --sender <addr>         AUTH_EMAIL_FROM (default: "Display <noreply@domain>")
 *   --cf-token <tok>        admin Cloudflare token (else stored profile, else guided)
 *   --owner <login>         GitHub owner (default: the gh-authed user)
 *   --public                create the repo public (default: private)
 *   --skip-repo             no GitHub repo, no ceremony; scaffold only
 *   --yes                   non-interactive: fail instead of prompting
 * Environment equivalents: ROOT_DOMAIN, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * AUTH_EMAIL_FROM, CLOUDFLARE_API_TOKEN, GITHUB_OWNER.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createInterface } from "node:readline/promises";

// ---------------------------------------------------------------- shell ----

type Run = { ok: boolean; stdout: string; stderr: string };

const run = (cmd: string, args: Array<string>, opts: { cwd?: string; env?: Record<string, string> } = {}): Run => {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    encoding: "utf8",
  });
  return { ok: r.status === 0, stdout: (r.stdout ?? "").trim(), stderr: (r.stderr ?? "").trim() };
};

const die = (message: string): never => {
  console.error(`\n  x ${message}`);
  process.exit(1);
};

const step = (message: string): void => console.log(`\n> ${message}`);

//template root: this file lives at packages/create-starting-flare/src/index.ts
const TEMPLATE_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

// ------------------------------------------------------------ arguments ----

type Args = {
  target?: string;
  slug?: string;
  display?: string;
  domain?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  sender?: string;
  cfToken?: string;
  owner?: string;
  publicRepo: boolean;
  skipRepo: boolean;
  yes: boolean;
  help: boolean;
};

const parseArgs = (): Args => {
  const argv = process.argv.slice(2);
  const args: Args = { publicRepo: false, skipRepo: false, yes: false, help: false };
  const value = (list: Array<string>, index: number, flag: string): string => {
    const v = list[index + 1] ?? die(`Flag ${flag} needs a value.`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) break;
    switch (a) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--yes":
      case "-y":
        args.yes = true;
        break;
      case "--public":
        args.publicRepo = true;
        break;
      case "--skip-repo":
        args.skipRepo = true;
        break;
      case "--slug":
        args.slug = value(argv, i, a);
        i++;
        break;
      case "--display":
        args.display = value(argv, i, a);
        i++;
        break;
      case "--domain":
        args.domain = value(argv, i, a);
        i++;
        break;
      case "--r2-access-key-id":
        args.r2AccessKeyId = value(argv, i, a);
        i++;
        break;
      case "--r2-secret-access-key":
        args.r2SecretAccessKey = value(argv, i, a);
        i++;
        break;
      case "--sender":
        args.sender = value(argv, i, a);
        i++;
        break;
      case "--cf-token":
        args.cfToken = value(argv, i, a);
        i++;
        break;
      case "--owner":
        args.owner = value(argv, i, a);
        i++;
        break;
      default:
        if (a.startsWith("-")) die(`Unknown flag: ${a}. Try --help.`);
        if (args.target !== undefined) die(`Unexpected extra argument: ${a}.`);
        args.target = a;
    }
  }
  return args;
};

const HELP = `
create-starting-flare: scaffold a new product from the starting-flare template.

  bunx github:Fawwaz-2009/starting-flare my-app [flags]

What it does:
  1. checks prerequisites (bun, git, gh authenticated, git identity)
  2. finds or guides a one-time Cloudflare admin credential (the mint power)
  3. copies the template with a FRESH git history and renames every identity
     token (display name, stack name, slug, package scope, rate-limit namespaces)
  4. creates the GitHub repo, runs the ceremony (mints the least-privilege CI
     token, writes all repo secrets), and opens the marker PR

Flags:
  --domain <d>                  required: a zone on your Cloudflare account
  --r2-access-key-id <id>       required: R2 S3 credential (Object Read)
  --r2-secret-access-key <k>    required: R2 S3 credential
  --display <name>              display name (default: title-cased slug)
  --sender <addr>               sender (default: "Display <noreply@domain>")
  --cf-token <tok>              Cloudflare admin token (else stored profile)
  --owner <login>               GitHub owner (default: gh-authed user)
  --public                      public repo (default: private)
  --skip-repo                   scaffold only: no repo, no ceremony
  --yes, -y                     non-interactive (for agents); fails instead
                                of prompting when something is missing

Environment equivalents: ROOT_DOMAIN, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
AUTH_EMAIL_FROM, CLOUDFLARE_API_TOKEN, GITHUB_OWNER.

Private template repo? \`bunx github:...\` fetches anonymously and needs the
template repo public. While it is private, clone it and run this file with bun.
`.trimStart();

// ------------------------------------------------------------ prompting ----

const rl = createInterface({ input: process.stdin, output: process.stdout });

const ask = async (question: string, fallback = ""): Promise<string> => {
  const suffix = fallback ? ` (${fallback})` : "";
  const answer = (await rl.question(`  ${question}${suffix}: `)).trim();
  return answer.length > 0 ? answer : fallback;
};

// ------------------------------------------------------------ naming -------

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const titleCase = (slug: string): string =>
  slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");

const pascalCase = (display: string): string => display.replace(/[^a-zA-Z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ""));

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ------------------------------------------------------ cloudflare API -----

const CF_API = "https://api.cloudflare.com/client/v4";

type CfErrors = Array<{ code: number; message: string }>;
type CfEnvelope<T> = { success: boolean; errors: CfErrors; result: T };

const cf = async <T>(method: string, pathname: string, token: string, body?: unknown): Promise<CfEnvelope<T>> => {
  const res = await fetch(`${CF_API}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return (await res.json()) as CfEnvelope<T>;
};

/**
 * The probe: prove the token can MINT tokens (create + delete a throwaway).
 * This is the exact power the ceremony needs, tested instead of assumed.
 * Creating tests "Account API Tokens: Edit"; listing the policy groups first
 * tests "Account API Tokens: Read".
 */
const probeMint = async (token: string, accountId: string): Promise<void> => {
  const groups = await cf<Array<{ id: string; name: string }>>("GET", `/accounts/${accountId}/tokens/permission_groups`, token);
  const group = groups.result?.find((g) => g.name === "Account Settings Read");
  if (!groups.success || group === undefined) {
    die(
      `The Cloudflare token cannot read token policy groups (${groups.errors[0]?.message ?? "no access"}).\n` +
        "  Recreate it with exactly two permissions: Account API Tokens: Read + Edit.",
    );
  }
  const created = await cf<{ id: string }>("POST", `/accounts/${accountId}/tokens`, token, {
    name: `create-starting-flare-probe-${Date.now()}`,
    policies: [
      {
        effect: "allow",
        permission_groups: [{ id: group!.id }],
        resources: { [`com.cloudflare.api.account.${accountId}`]: "*" },
      },
    ],
  });
  if (!created.success || created.result === undefined) {
    die(
      `The Cloudflare token cannot mint tokens (${created.errors[0]?.message ?? "unknown error"}).\n` +
        "  API-minted tokens can never carry this power; the token must be created in the\n" +
        "  dashboard (My Profile > API Tokens) with: Account API Tokens: Read + Edit.",
    );
  }
  await cf("DELETE", `/accounts/${accountId}/tokens/${created.result.id}`, token); //best effort cleanup
};

// ------------------------------------------------- stored admin profile ----

const ALCHEMY_DIR = path.join(os.homedir(), ".alchemy");
const PROFILE = "admin";

type StoredCredential = { type: string; apiToken?: string; accountId?: string };
type ProfilesFile = { version: number; profiles: Record<string, Record<string, unknown>> };

/** Reads every stored API-token credential across alchemy profiles. */
const storedAdminCredentials = (): Array<{ profile: string; apiToken: string; accountId: string }> => {
  const configPath = path.join(ALCHEMY_DIR, "profiles.json");
  let parsed: ProfilesFile;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as ProfilesFile;
  } catch {
    return [];
  }
  const found: Array<{ profile: string; apiToken: string; accountId: string }> = [];
  for (const [name, providers] of Object.entries(parsed.profiles ?? {})) {
    const cfConfig = providers.Cloudflare as { method?: string; credentialType?: string } | undefined;
    if (cfConfig?.method !== "stored" || cfConfig.credentialType !== "apiToken") continue;
    try {
      const cred = JSON.parse(fs.readFileSync(path.join(ALCHEMY_DIR, "credentials", name, "cf-stored.json"), "utf8")) as StoredCredential;
      if (cred.type === "apiToken" && cred.apiToken && cred.accountId) {
        found.push({ profile: name, apiToken: cred.apiToken, accountId: cred.accountId });
      }
    } catch {
      //unreadable credential file: skip this profile
    }
  }
  return found.sort((a, b) => (a.profile === PROFILE ? -1 : b.profile === PROFILE ? 1 : 0));
};

/** Writes ~/.alchemy state exactly as `alchemy login` (API-token method) would. */
const storeAdminProfile = (apiToken: string, accountId: string): void => {
  const configPath = path.join(ALCHEMY_DIR, "profiles.json");
  let parsed: ProfilesFile = { version: 0, profiles: {} };
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as ProfilesFile;
  } catch {
    //fresh install
  }
  parsed.version ??= 0;
  parsed.profiles ??= {};
  const existing = (parsed.profiles[PROFILE] ?? {}) as Record<string, unknown>;
  parsed.profiles[PROFILE] = {
    ...existing,
    Cloudflare: { method: "stored", credentialType: "apiToken" },
    GitHub: { method: "gh-cli" },
  };
  fs.mkdirSync(ALCHEMY_DIR, { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(parsed, null, 2)}\n`);
  const credDir = path.join(ALCHEMY_DIR, "credentials", PROFILE);
  fs.mkdirSync(credDir, { recursive: true });
  const credPath = path.join(credDir, "cf-stored.json");
  fs.writeFileSync(credPath, `${JSON.stringify({ type: "apiToken", apiToken, accountId }, null, 2)}\n`, { mode: 0o600 });
};

const openUrl = (url: string): void => {
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  const r = run(opener, [url]);
  if (!r.ok) console.log(`  Open this URL: ${url}`);
};

/**
 * Resolves the admin credential (the one power that cannot be delegated:
 * minting tokens). Order: explicit token, stored alchemy profiles, guided
 * dashboard flow. Every candidate is PROBED before use.
 */
const resolveAdmin = async (args: Args): Promise<{ apiToken: string; accountId: string }> => {
  step("Cloudflare admin credential (the power to mint the CI token)");

  const candidates: Array<{ apiToken: string; accountId?: string; label: string; persist: boolean }> = [];
  //the flag is explicit user intent (persist); the env var may be a transient
  //pickup (bun auto-loads .env), so it is used but never written to disk
  if (args.cfToken) candidates.push({ apiToken: args.cfToken, label: "--cf-token", persist: true });
  else if (process.env.CLOUDFLARE_API_TOKEN) {
    candidates.push({ apiToken: process.env.CLOUDFLARE_API_TOKEN, label: "CLOUDFLARE_API_TOKEN (env, not stored)", persist: false });
  }
  for (const stored of storedAdminCredentials()) {
    candidates.push({ apiToken: stored.apiToken, accountId: stored.accountId, label: `stored alchemy profile '${stored.profile}'`, persist: false });
  }

  for (const candidate of candidates) {
    let accountId = candidate.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!accountId) {
      const accounts = await cf<Array<{ id: string; name: string }>>("GET", "/accounts", candidate.apiToken);
      const list = accounts.result ?? [];
      if (list.length === 1) accountId = list[0]!.id;
      else if (list.length > 1 && args.yes) accountId = list[0]!.id;
      else if (list.length > 1) {
        console.log("  The token can access several accounts:");
        list.forEach((a, i) => console.log(`    ${i + 1}. ${a.name} (${a.id})`));
        const pick = Number(await ask("Which account number"));
        accountId = list[pick - 1]?.id;
      }
    }
    if (!accountId) continue;
    await probeMint(candidate.apiToken, accountId);
    console.log(`  using ${candidate.label}: can mint tokens (probe passed)`);
    if (candidate.persist) storeAdminProfile(candidate.apiToken, accountId);
    return { apiToken: candidate.apiToken, accountId };
  }

  if (args.yes) {
    die(
      "No usable Cloudflare admin credential found (--yes mode).\n" +
        "  Create a dashboard token (My Profile > API Tokens > Create Custom Token) with:\n" +
        "    Account API Tokens: Read\n" +
        "    Account API Tokens: Edit\n" +
        "  then retry with --cf-token <token>.",
    );
  }

  console.log(
    "  I need a one-time Cloudflare credential that can create other credentials.\n" +
      "  Opening the dashboard: create a Custom Token with EXACTLY two permissions:\n" +
      "      Account API Tokens: Read\n" +
      "      Account API Tokens: Edit\n" +
      "  Name it anything. The token is stored locally (~/.alchemy, profile 'admin')\n" +
      "  and powers the ceremony; the CI token it mints is the only secret that leaves.",
  );
  openUrl("https://dash.cloudflare.com/profile/api-tokens");
  const apiToken = await ask("Paste the token");
  if (!apiToken) die("No token pasted.");
  const accounts = await cf<Array<{ id: string; name: string }>>("GET", "/accounts", apiToken);
  if (!accounts.success || (accounts.result?.length ?? 0) === 0) {
    die(
      `Cloudflare rejected the token for account access (${accounts.errors[0]?.message ?? "empty"}).\n` +
        "  Check that both permissions were ticked, then paste again (rerun the command).",
    );
  }
  let accountId = accounts.result![0]!.id;
  if (accounts.result!.length > 1) {
    accounts.result!.forEach((a, i) => console.log(`    ${i + 1}. ${a.name} (${a.id})`));
    const pick = Number(await ask("Which account number"));
    accountId = accounts.result![pick - 1]?.id ?? accountId;
  }
  await probeMint(apiToken, accountId);
  storeAdminProfile(apiToken, accountId);
  console.log("  verified: can mint tokens. Stored as profile 'admin'.");
  return { apiToken, accountId };
};

// -------------------------------------------------------------- scaffold ---

const COPY_DENYLIST = new Set([
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
  "packages", //the scaffolding tool itself never ships in the product
  "dist",
  "temp",
  ".DS_Store",
]);
// eslint-disable-next-line no-control-regex -- intentional: detects binary files (control chars) so the rename pass can skip them
const CONTROL_RE = /[\0\x08\x0e-\x1f]/;

const copyTemplate = (from: string, to: string): void => {
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
 * the package scope before the bare slug.
 */
const renameIdentity = (root: string, slug: string, display: string): { nsGlobal: number; nsAuth: number } => {
  const pascal = pascalCase(display);
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
        continue;
      }
      let content: string;
      try {
        content = fs.readFileSync(p, "utf8");
      } catch {
        continue; //unreadable: leave untouched
      }
      if (CONTROL_RE.test(content)) continue; //binary-ish: leave untouched
      let next = content
        .replaceAll("Starting Flare", display)
        .replaceAll("StartingFlare", pascal)
        .replaceAll("@starting-flare/", `@${slug}/`)
        .replaceAll("starting-flare", slug);
      if (p.endsWith(path.join("apps", "backend", "config", "rate-limit.ts"))) {
        //namespace ids are account-global; the scaffold claims fresh ones
        const nsGlobal = 10000 + Math.floor(Math.random() * 80000);
        const nsAuth = 10000 + Math.floor(Math.random() * 80000);
        next = next.replaceAll("namespaceId: 9001", `namespaceId: ${nsGlobal}`).replaceAll("namespaceId: 9002", `namespaceId: ${nsAuth}`);
      }
      if (next !== content) fs.writeFileSync(p, next);
    }
  };
  walk(root);

  //the copied root package.json must not carry the scaffolding bin or the
  //excluded packages workspace (the tool pointed at files that do not ship)
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { bin?: unknown; workspaces?: Array<string> };
  delete pkg.bin;
  pkg.workspaces = (pkg.workspaces ?? []).filter((w) => w !== "packages/*");
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  return { nsGlobal: 0, nsAuth: 0 };
};

const scanLeftovers = (root: string): Array<string> => {
  const leftovers: Array<string> = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (COPY_DENYLIST.has(entry.name)) continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
        continue;
      }
      let content: string;
      try {
        content = fs.readFileSync(p, "utf8");
      } catch {
        continue;
      }
      if (/starting[\s_-]?flare/i.test(content)) leftovers.push(path.relative(root, p));
    }
  };
  walk(root);
  return leftovers;
};

const writeEnv = (root: string, values: { domain: string; sender: string; r2AccessKeyId: string; r2SecretAccessKey: string; owner: string; repo: string }): void => {
  const lines = [
    "# Written by create-starting-flare. Local development needs nothing here;",
    "# these values drive deploys and the ceremony (stacks/github.ts).",
    `ROOT_DOMAIN=${values.domain}`,
    `AUTH_EMAIL_FROM=${values.sender}`,
    `R2_ACCESS_KEY_ID=${values.r2AccessKeyId}`,
    `R2_SECRET_ACCESS_KEY=${values.r2SecretAccessKey}`,
    "# Ceremony inputs (rerun: bunx alchemy deploy stacks/github.ts --profile admin --stage bootstrap --yes)",
    `GITHUB_OWNER=${values.owner}`,
    `GITHUB_REPO=${values.repo}`,
    "",
  ];
  fs.writeFileSync(path.join(root, ".env"), lines.join("\n"));
};

// ------------------------------------------------------------------ main ---

const main = async (): Promise<void> => {
  const args = parseArgs();
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }
  console.log("\ncreate-starting-flare\n");

  // ---- prerequisites -----------------------------------------------------
  step("Prerequisites");
  if (TEMPLATE_ROOT === "" || !fs.existsSync(path.join(TEMPLATE_ROOT, "alchemy.run.ts"))) {
    die(`Template source not found next to the CLI (expected ${TEMPLATE_ROOT}).`);
  }
  const bunVersion = run("bun", ["--version"]);
  if (!bunVersion.ok) die("Bun is not installed. Install it: curl -fsSL https://bun.sh/install | bash");
  const gitVersion = run("git", ["--version"]);
  if (!gitVersion.ok) die("git is not installed. Install it: https://git-scm.com");
  const ghVersion = run("gh", ["--version"]);
  if (!ghVersion.ok) die("GitHub CLI is not installed. Install it: brew install gh (or https://cli.github.com)");
  const ghAuth = run("gh", ["auth", "status"]);
  if (!ghAuth.ok) die("GitHub CLI is not authenticated. Run: gh auth login");
  const ghUser = run("gh", ["api", "user", "--jq", ".login"]);
  if (!ghUser.ok) die("Could not resolve the GitHub login. Run: gh auth login");
  const owner = args.owner ?? process.env.GITHUB_OWNER ?? ghUser.stdout;
  const gitEmail = run("git", ["config", "user.email"]);
  const gitName = run("git", ["config", "user.name"]);
  if (!gitEmail.ok || !gitName.ok) {
    die(
      "git has no identity configured (commits would fail).\n" +
        `  Run: git config --global user.name "${owner}" && git config --global user.email "${owner}@users.noreply.github.com"`,
    );
  }
  console.log(`  bun ${bunVersion.stdout} | git ok | gh ok (${owner})`);

  // ---- admin credential --------------------------------------------------
  const admin = await resolveAdmin(args);

  // ---- prompts -----------------------------------------------------------
  step("Project");
  let target = args.target;
  if (!target && args.yes) die("No target directory given. Usage: create-starting-flare my-app --domain d --r2-access-key-id i --r2-secret-access-key s --yes");
  while (!target) {
    target = await ask("Project name (also the directory)");
    if (!target) console.log("  A name is required.");
  }
  const slug = slugify(args.slug ?? path.basename(target));
  if (slug.length < 2) die(`Invalid project slug: "${slug}". Use letters, digits and dashes (2+ chars).`);
  target = path.resolve(process.cwd(), target);
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    die(`Target directory exists and is not empty: ${target}`);
  }

  const defaultDisplay = titleCase(slug);
  const display = args.display ?? (args.yes ? defaultDisplay : await ask("Display name", defaultDisplay));

  let domain = args.domain ?? process.env.ROOT_DOMAIN;
  while (!domain) {
    domain = await ask("Root domain (a zone on your Cloudflare account, e.g. myapp.dev)");
    if (domain && !DOMAIN_RE.test(domain)) {
      console.log("  That does not look like a hostname. Try again (no scheme, no path).");
      domain = "";
    }
  }
  if (!domain || !DOMAIN_RE.test(domain)) die("A valid --domain (ROOT_DOMAIN) is required: a zone on the Cloudflare account.");
  domain = domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  let r2AccessKeyId = args.r2AccessKeyId ?? process.env.R2_ACCESS_KEY_ID ?? "";
  let r2SecretAccessKey = args.r2SecretAccessKey ?? process.env.R2_SECRET_ACCESS_KEY ?? "";
  let skipRepo = args.skipRepo;
  while (!r2AccessKeyId || !r2SecretAccessKey) {
    if (args.yes) die("Missing R2 credentials: pass --r2-access-key-id and --r2-secret-access-key (or the env equivalents).");
    console.log("  R2 S3 credentials presign image URLs. Create them once:");
    console.log(`    https://dash.cloudflare.com/${admin.accountId}/r2/api-tokens  (Object Read)`);
    const accessKey = await ask("R2 access key id (or 'skip' to set up later without CI)");
    if (accessKey.toLowerCase() === "skip") {
      skipRepo = true;
      break;
    }
    const secretKey = await ask("R2 secret access key");
    if (accessKey && secretKey) {
      r2AccessKeyId = accessKey;
      r2SecretAccessKey = secretKey;
    }
  }
  if (!skipRepo && (!r2AccessKeyId || !r2SecretAccessKey)) {
    if (args.yes) die("R2 credentials are required for the repo + ceremony flow.");
  }

  const defaultSender = `${display} <noreply@${domain}>`;
  let sender = args.sender ?? process.env.AUTH_EMAIL_FROM ?? "";
  if (!sender && !args.yes) sender = await ask("Sender for sign-in codes", defaultSender);
  if (!sender) sender = defaultSender;
  if (!EMAIL_RE.test(sender.match(/<([^>]+)>/)?.[1] ?? sender)) {
    die(`Invalid sender address: ${sender}`);
  }

  console.log(`\n  ${display} (${slug})`);
  console.log(`  ${target}`);
  if (!skipRepo) {
    console.log(`  repo    ${owner}/${slug} ${args.publicRepo ? "(public)" : "(private)"}`);
    console.log(`  prod    https://${slug}.${domain} after merge`);
  }
  if (!args.yes) {
    const go = await ask("Looks good? (Y/n)", "Y");
    if (go.toLowerCase() === "n") die("Aborted. Nothing was written.");
  }

  // ---- scaffold ----------------------------------------------------------
  step("Scaffold (copy, rename, fresh history)");
  copyTemplate(TEMPLATE_ROOT, target);
  renameIdentity(target, slug, display);
  const leftovers = scanLeftovers(target);
  if (leftovers.length > 0) {
    console.warn(`  warning: identity tokens remain in: ${leftovers.join(", ")}`);
  }
  if (!skipRepo) {
    writeEnv(target, { domain, sender, r2AccessKeyId, r2SecretAccessKey, owner, repo: slug });
  }
  for (const cmd of [
    ["init", "-b", "main"],
    ["add", "-A"],
    ["commit", "-m", `Scaffold ${display} from starting-flare`, "--quiet"],
  ]) {
    const r = run("git", cmd, { cwd: target });
    if (!r.ok) die(`git ${cmd[0]} failed in ${target}: ${r.stderr}`);
  }
  console.log("  copied, renamed, committed on main (fresh history)");

  step("bun install");
  const install = run("bun", ["install"], { cwd: target });
  if (!install.ok) die(`bun install failed: ${install.stderr}`);

  if (skipRepo) {
    rl.close();
    console.log(
      `\n  Done (local only). When the R2 credentials and repo are ready, from ${target}:\n` +
        "    1. add the values to .env (see .env.example)\n" +
        "    2. gh repo create " +
        `${owner}/${slug} --private --source . --remote origin --push\n` +
        "    3. bunx alchemy deploy stacks/github.ts --profile admin --stage bootstrap --yes\n",
    );
    return;
  }

  // ---- repo + ceremony + marker PR ----------------------------------------
  step(`GitHub repo ${owner}/${slug}`);
  const repoFull = `${owner}/${slug}`;
  const existing = run("gh", ["repo", "view", repoFull, "--json", "name", "--jq", ".name"]);
  if (existing.ok) {
    console.log(`  repo exists: adopting ${repoFull}`);
    const remote = run("git", ["remote", "add", "origin", `https://github.com/${repoFull}.git`], { cwd: target });
    if (!remote.ok) console.log("  remote origin already set");
    const push = run("git", ["push", "-u", "origin", "main"], { cwd: target });
    if (!push.ok) die(`git push failed: ${push.stderr}`);
  } else {
    const visibility = args.publicRepo ? "--public" : "--private";
    const created = run("gh", ["repo", "create", repoFull, visibility, "--source", ".", "--remote", "origin", "--push"], { cwd: target });
    if (!created.ok) die(`gh repo create failed: ${created.stderr}`);
  }

  step("Ceremony: mint CI token, write repo secrets");
  const ghToken = run("gh", ["auth", "token"]);
  if (!ghToken.ok) die("Could not read the GitHub token (gh auth token failed).");
  const ceremony = run("bunx", ["alchemy", "deploy", "stacks/github.ts", "--profile", "admin", "--stage", "bootstrap", "--yes"], {
    cwd: target,
    env: { GITHUB_TOKEN: ghToken.stdout, CI: "true" },
  });
  if (!ceremony.ok) {
    die(
      `The ceremony failed:\n${ceremony.stderr.split("\n").slice(-15).join("\n")}\n` +
        "  Fix the cause, then rerun from the project root:\n" +
        "    bunx alchemy deploy stacks/github.ts --profile admin --stage bootstrap --yes",
    );
  }
  const secrets = run("gh", ["secret", "list", "-R", repoFull, "--json", "name", "--jq", ".[].name"]);
  const expected = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "ROOT_DOMAIN", "AUTH_EMAIL_FROM", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
  const present = new Set(secrets.stdout.split("\n"));
  const missing = expected.filter((name) => !present.has(name));
  if (missing.length > 0) {
    die(`Ceremony ran, but these repo secrets are missing: ${missing.join(", ")}`);
  }
  console.log(`  all ${expected.length} secrets verified in ${repoFull}`);

  step("Marker PR");
  const branch = run("git", ["checkout", "-b", "first-light"], { cwd: target });
  if (!branch.ok) die(`git checkout -b first-light failed: ${branch.stderr}`);
  const empty = run("git", ["commit", "--allow-empty", "-m", "first light", "--quiet"], { cwd: target });
  if (!empty.ok) die(`git commit failed: ${empty.stderr}`);
  const pushBranch = run("git", ["push", "-u", "origin", "first-light"], { cwd: target });
  if (!pushBranch.ok) die(`git push failed: ${pushBranch.stderr}`);

  const body = [
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
  const pr = run("gh", ["pr", "create", "--base", "main", "--head", "first-light", "--title", "First light", "--body", body], { cwd: target });
  const prUrl = pr.ok ? (pr.stdout.split("\n").at(-1) ?? "") : "";

  rl.close();
  console.log(
    `\n  Done. ${display} exists in three places:\n` +
      `    repo     https://github.com/${repoFull}\n` +
      `    marker   ${prUrl || "(open the PR from the repo page)"}\n` +
      `    local    cd ${target} && bun run dev\n` +
      "\n" +
      "  Remaining setup is the checklist on the PR (email sender + branch protection).\n" +
      `  Merge it when ready: prod deploys, and the first sign-in is the peace sign.\n` +
      `  Parallel agents: bun scripts/wt.ts <name>   (see AGENTS.md)\n`,
  );
};

try {
  await main();
} catch (error) {
  die(error instanceof Error ? error.message : String(error));
}

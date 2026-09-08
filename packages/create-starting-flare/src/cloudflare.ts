import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as p from "@clack/prompts";
import type { Args } from "./args.ts";
import { cancelled, fail } from "./ui.ts";

const CF_API = "https://api.cloudflare.com/client/v4";
const PROFILE = "admin";
const ALCHEMY_DIR = path.join(os.homedir(), ".alchemy");

type CfErrors = Array<{ code: number; message: string }>;
type CfEnvelope<T> = { success: boolean; errors: CfErrors; result: T };
type CfAccount = { id: string; name: string };

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
 * tests "Account API Tokens: Read". Throws with the missing permission.
 */
const probeMint = async (token: string, accountId: string): Promise<void> => {
  const groups = await cf<Array<{ id: string; name: string }>>("GET", `/accounts/${accountId}/tokens/permission_groups`, token);
  const group = groups.result?.find((g) => g.name === "Account Settings Read");
  if (!groups.success || group === undefined) {
    throw new Error(`missing "Account API Tokens: Read" (${groups.errors[0]?.message ?? "no access"})`);
  }
  const created = await cf<{ id: string }>("POST", `/accounts/${accountId}/tokens`, token, {
    name: `create-starting-flare-probe-${Date.now()}`,
    policies: [
      {
        effect: "allow",
        permission_groups: [{ id: group.id }],
        resources: { [`com.cloudflare.api.account.${accountId}`]: "*" },
      },
    ],
  });
  if (!created.success || created.result === undefined) {
    throw new Error(`missing "Account API Tokens: Edit" (${created.errors[0]?.message ?? "unknown error"})`);
  }
  await cf("DELETE", `/accounts/${accountId}/tokens/${created.result.id}`, token); // best effort cleanup
};

type StoredCredential = { type: string; apiToken?: string; accountId?: string };
type ProfilesFile = { version: number; profiles: Record<string, Record<string, unknown>> };

/** Reads every stored API-token credential across alchemy profiles. */
export const storedAdminCredentials = (): Array<{ profile: string; apiToken: string; accountId: string }> => {
  let parsed: ProfilesFile;
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(ALCHEMY_DIR, "profiles.json"), "utf8")) as ProfilesFile;
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
      // unreadable credential file: skip this profile
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
    // fresh install
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
  fs.writeFileSync(path.join(credDir, "cf-stored.json"), `${JSON.stringify({ type: "apiToken", apiToken, accountId }, null, 2)}\n`, { mode: 0o600 });
};

const openUrl = (url: string): void => {
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  const r = Bun.spawnSync([opener, url]);
  if (r.exitCode !== 0) p.log.message(`Open this URL: ${url}`);
};

const pickAccount = async (accounts: Array<CfAccount>): Promise<string> => {
  if (accounts.length === 1) return accounts[0]!.id;
  const picked = await p.select({
    message: "Which Cloudflare account?",
    options: accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.id})` })),
  });
  if (p.isCancel(picked)) cancelled();
  return picked as string;
};

export type AdminCredential = { apiToken: string; accountId: string; summary: string };

/**
 * Resolves the one credential that cannot be delegated: the power to mint
 * tokens. Tried silently in order (flag, environment, stored profiles); if
 * none works, the guided dashboard flow creates one. The returned summary
 * is the SINGLE line the user sees about this step.
 */
export const resolveAdmin = async (args: Args): Promise<AdminCredential> => {
  type Candidate = { apiToken: string; accountId?: string; label: string; persist: boolean };
  const candidates: Array<Candidate> = [];
  // the flag is explicit user intent (persist); the env var may be a
  // transient pickup (bun auto-loads .env), so it is used but never stored
  if (args.cfToken) candidates.push({ apiToken: args.cfToken, label: "--cf-token", persist: true });
  else if (process.env.CLOUDFLARE_API_TOKEN) {
    candidates.push({
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      label: "CLOUDFLARE_API_TOKEN (env, not stored)",
      persist: false,
    });
  }
  for (const stored of storedAdminCredentials()) {
    candidates.push({
      apiToken: stored.apiToken,
      accountId: stored.accountId,
      label: `stored alchemy profile '${stored.profile}'`,
      persist: false,
    });
  }

  for (const candidate of candidates) {
    let accountId = candidate.accountId;
    if (!accountId) {
      const accounts = await cf<Array<CfAccount>>("GET", "/accounts", candidate.apiToken);
      const list = accounts.result ?? [];
      if (list.length === 0) continue;
      accountId = args.yes ? list[0]!.id : await pickAccount(list);
    }
    try {
      await probeMint(candidate.apiToken, accountId);
    } catch {
      continue; // this candidate lacks the mint power: try the next source
    }
    if (candidate.persist) storeAdminProfile(candidate.apiToken, accountId);
    return {
      apiToken: candidate.apiToken,
      accountId,
      summary: "Using your Cloudflare credential, verified: can mint CI tokens",
    };
  }

  if (args.yes) {
    fail(
      "No usable Cloudflare admin credential found (--yes mode).\n" +
        "  Create a dashboard token (My Profile > API Tokens > Create Custom Token) with:\n" +
        "    Account API Tokens: Read\n" +
        "    Account API Tokens: Edit\n" +
        "  then retry with --cf-token <token>.",
    );
  }

  // guided flow: nothing on this machine can mint tokens yet
  p.log.message(
    [
      "One setup step needs you: a Cloudflare credential that can create other",
      "credentials (the CI token is minted with it, then it never leaves this",
      "machine). Opening the dashboard, create a Custom Token with exactly:",
      "",
      "    Account API Tokens: Read",
      "    Account API Tokens: Edit",
    ].join("\n"),
  );
  openUrl("https://dash.cloudflare.com/profile/api-tokens");

  const pasted = await p.text({
    message: "Paste the token",
    validate: (v) => (v && v.trim().length > 0 ? undefined : "A token is required"),
  });
  if (p.isCancel(pasted)) cancelled();
  const apiToken = (pasted as string).trim();

  const accounts = await cf<Array<CfAccount>>("GET", "/accounts", apiToken);
  if (!accounts.success || (accounts.result?.length ?? 0) === 0) {
    fail(
      `Cloudflare rejected the token for account access (${accounts.errors[0]?.message ?? "empty"}).\n` +
        "  Check that both permissions were ticked, then rerun and paste again.",
    );
  }
  const accountId = await pickAccount(accounts.result!);
  try {
    await probeMint(apiToken, accountId);
  } catch (error) {
    fail(
      `The pasted token cannot mint CI tokens: ${error instanceof Error ? error.message : String(error)}.\n` +
        "  Recreate it with both boxes ticked (Account API Tokens: Read + Edit), then rerun.",
    );
  }
  storeAdminProfile(apiToken, accountId);
  return {
    apiToken,
    accountId,
    summary: "New Cloudflare admin credential verified and stored locally (~/.alchemy, profile 'admin')",
  };
};

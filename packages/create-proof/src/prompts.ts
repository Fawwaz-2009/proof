import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import type { Args } from "./args.ts";
import { cancelled, fail } from "./ui.ts";

export type Answers = {
  target: string;
  slug: string;
  display: string;
  domain: string;
  sender: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  skipRepo: boolean;
};

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const titleCase = (slug: string): string =>
  slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");

const cleanDomain = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

const askText = async (message: string, fallback: string, validate?: (v: string) => string | undefined): Promise<string> => {
  const answer = await p.text({ message, placeholder: fallback, defaultValue: fallback, validate });
  if (p.isCancel(answer)) cancelled();
  const value = (answer as string).trim();
  return value.length > 0 ? value : fallback;
};

/**
 * The question flow. Non-interactive mode (--yes) resolves everything from
 * flags and environment and fails loudly naming exactly what is missing.
 */
export const collectAnswers = async (args: Args): Promise<Answers> => {
  // ---- target ------------------------------------------------------------
  let target = args.target;
  if (!target && args.yes) fail("No target directory given. Usage: create-proof my-app [flags]");
  while (!target) {
    target = await askText("Project name (also the directory)", "");
    if (!target) p.log.warn("A name is required.");
  }
  const slug = slugify(args.slug ?? path.basename(target));
  if (slug.length < 2) fail(`Invalid project slug: "${slug}". Use letters, digits and dashes (2+ chars).`);
  target = path.resolve(process.cwd(), target);
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    fail(`Target directory exists and is not empty: ${target}`);
  }

  // ---- display -----------------------------------------------------------
  const defaultDisplay = titleCase(slug);
  let display = args.display;
  if (!display && !args.yes) display = await askText("Display name", defaultDisplay);
  if (!display) display = defaultDisplay;

  // ---- domain ------------------------------------------------------------
  let domain = args.domain ?? process.env.ROOT_DOMAIN;
  while (!domain) {
    const raw = await askText("Root domain (a zone on your Cloudflare account, e.g. myapp.dev)", "");
    const cleaned = cleanDomain(raw);
    if (cleaned && !DOMAIN_RE.test(cleaned)) p.log.warn("That does not look like a hostname (no scheme, no path).");
    else if (cleaned) domain = cleaned;
  }
  if (!domain || !DOMAIN_RE.test(domain)) {
    fail("A valid --domain (ROOT_DOMAIN) is required: a zone on the Cloudflare account.");
  }
  domain = cleanDomain(domain);

  // ---- R2 credentials ----------------------------------------------------
  let r2AccessKeyId = args.r2AccessKeyId ?? process.env.R2_ACCESS_KEY_ID ?? "";
  let r2SecretAccessKey = args.r2SecretAccessKey ?? process.env.R2_SECRET_ACCESS_KEY ?? "";
  let skipRepo = args.skipRepo;
  if ((!r2AccessKeyId || !r2SecretAccessKey) && !args.yes) {
    p.log.message("R2 S3 credentials presign image URLs. Create them once in the dashboard\n" + "(R2 > Manage R2 API tokens, Object Read scope).");
  }
  while (!r2AccessKeyId || !r2SecretAccessKey) {
    if (args.yes) fail("Missing R2 credentials: pass --r2-access-key-id and --r2-secret-access-key (or the env equivalents).");
    const accessKey = (await askText("R2 access key id (or 'skip' to set up later without CI)", "")).toLowerCase();
    if (accessKey === "skip") {
      skipRepo = true;
      break;
    }
    const secretKey = await askText("R2 secret access key", "");
    if (accessKey && secretKey) {
      r2AccessKeyId = accessKey;
      r2SecretAccessKey = secretKey;
    } else {
      p.log.warn("Both key and secret are needed.");
    }
  }

  // ---- sender ------------------------------------------------------------
  const defaultSender = `${display} <noreply@${domain}>`;
  let sender = args.sender ?? process.env.AUTH_EMAIL_FROM ?? "";
  if (!sender && !args.yes) sender = await askText("Sender for sign-in codes", defaultSender);
  if (!sender) sender = defaultSender;
  if (!EMAIL_RE.test(sender.match(/<([^>]+)>/)?.[1] ?? sender)) {
    fail(`Invalid sender address: ${sender}`);
  }

  return { target, slug, display, domain, sender, r2AccessKeyId, r2SecretAccessKey, skipRepo };
};

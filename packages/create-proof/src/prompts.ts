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
  skipRepo: boolean;
};

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+$/;

// localhost is legitimate: non-prod stages capture codes to logs and never
// send, so the zero-config default sender has no dot in its host.
const looksLikeAddress = (sender: string): boolean => {
  const address = sender.match(/<([^>]+)>/)?.[1] ?? sender;
  if (!EMAIL_RE.test(address)) return false;
  const host = address.split("@")[1] ?? "";
  return host === "localhost" || host.includes(".");
};

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

  let skipRepo = args.skipRepo;
  // ---- domain (optional: day zero runs on the platform host) -------------
  let domain = args.domain ?? process.env.ROOT_DOMAIN ?? "";
  if (!domain && !args.yes) {
    const wantsDomain = await p.confirm({
      message: "Deploy to your own domain? (enter for no: the app ships on the platform host)",
      initialValue: false,
    });
    if (p.isCancel(wantsDomain)) cancelled();
    if (wantsDomain === true) {
      while (!domain) {
        const raw = await askText("Root domain (a zone on your Cloudflare account, e.g. myapp.dev)", "");
        const cleaned = cleanDomain(raw);
        if (cleaned && !DOMAIN_RE.test(cleaned)) p.log.warn("That does not look like a hostname (no scheme, no path).");
        else if (cleaned) domain = cleaned;
      }
    }
  }
  if (domain) {
    if (!DOMAIN_RE.test(cleanDomain(domain))) {
      fail("A valid --domain (ROOT_DOMAIN) is required: a zone on the Cloudflare account.");
    }
    domain = cleanDomain(domain);
  }

  // ---- sender ------------------------------------------------------------
  const hostForMail = domain || "localhost";
  const defaultSender = `${display} <noreply@${hostForMail}>`;
  let sender = args.sender ?? process.env.AUTH_EMAIL_FROM ?? "";
  if (!sender && !args.yes) sender = await askText("Sender for sign-in codes", defaultSender);
  if (!sender) sender = defaultSender;
  if (!looksLikeAddress(sender)) {
    fail(`Invalid sender address: ${sender}`);
  }

  return { target, slug, display, domain, sender, skipRepo };
};

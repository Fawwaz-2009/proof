/** Flags for agents; every interactive prompt has a flag or env equivalent. */
export type Args = {
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

export const HELP = `
create-starting-flare: scaffold a product from the starting-flare template.

  bunx create-starting-flare my-app [flags]

What it does:
  1. checks prerequisites (bun, git, gh authenticated, git identity)
  2. finds or guides a one-time Cloudflare admin credential (the mint power)
  3. copies the bundled template with a FRESH git history and renames every
     identity token (display name, stack name, slug, package scope,
     rate-limit namespaces)
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
`.trimStart();

export const parseArgs = (): Args => {
  const argv = process.argv.slice(2);
  const args: Args = { publicRepo: false, skipRepo: false, yes: false, help: false };
  const value = (list: Array<string>, index: number, flag: string): string => {
    const v = list[index + 1];
    if (v === undefined) {
      console.error(`Flag ${flag} needs a value.`);
      process.exit(1);
    }
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
        if (a.startsWith("-")) {
          console.error(`Unknown flag: ${a}. Try --help.`);
          process.exit(1);
        }
        if (args.target !== undefined) {
          console.error(`Unexpected extra argument: ${a}.`);
          process.exit(1);
        }
        args.target = a;
    }
  }
  return args;
};

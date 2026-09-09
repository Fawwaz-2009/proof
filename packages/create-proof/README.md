# create-proof

From zero to AI-driven development in under two minutes. You don't review
diffs: every pull request ships with a proof, the real app running isolated
on your own domain. Mark it up, merge, and it ships.

Scaffold a production-grade product from the
[proof](https://github.com/Fawwaz-2009/proof) template: a
Bun monorepo on Effect v4 + Cloudflare Workers + Alchemy v2, with Better Auth
email OTP, TanStack Start, per-PR preview deployments, and a merge-to-main
production pipeline.

```sh
bunx create-proof my-app
```

One command, a finished day zero:

- checks prerequisites (bun, git, gh) with exact install commands on failure
- finds or guides a one-time Cloudflare admin credential (the power to mint
  the CI token), verified with a live mint probe before use
- copies the template with a FRESH git history (no template commits)
- renames every identity token: app name (as the APP_NAME env var), stack
  name, slug, package scope, plus fresh rate-limit namespaces
- creates the GitHub repo, mints the least-privilege CI token, writes every
  repo secret, and opens the marker PR with the remaining-setup checklist

## Flags

Every prompt has a flag or environment equivalent, so agents drive the same
flow non-interactively:

```sh
bunx create-proof my-app --domain myapp.dev --yes

Omit --domain to ship on the platform host; add your domain later by
setting ROOT_DOMAIN in .env and redeploying.
```

`--help` lists all flags. Environment equivalents: `ROOT_DOMAIN`,
`ROOT_DOMAIN`, `AUTH_EMAIL_FROM`, `CLOUDFLARE_API_TOKEN`, `GITHUB_OWNER`.
R2 credentials are minted for you by the ceremony.

## Requirements

[Bun](https://bun.sh) 1.2+, git, and the
[GitHub CLI](https://cli.github.com) authenticated (`gh auth login`).

#!/usr/bin/env bun
/**
 * create-starting-flare: scaffold a new product from this template.
 *
 *   bunx create-starting-flare my-app
 *
 * Flow discipline (Don't Make Me Think): the user answers questions about
 * THEIR product first; machinery runs afterwards, one line per step, and
 * each capability (git, gh, Cloudflare) is checked exactly where it is
 * used, with the exact remediation on failure.
 */

import * as fs from "node:fs";
import { confirm, isCancel } from "@clack/prompts";
import { run } from "./shell.ts";
import { banner, fail, info, outro, phase, summary, warn } from "./ui.ts";
import { HELP, parseArgs } from "./args.ts";
import { resolveAdmin } from "./cloudflare.ts";
import { collectAnswers } from "./prompts.ts";
import { scaffold, TEMPLATE_ROOT } from "./scaffold.ts";
import { adoptRepo, createRepo, expectedSecrets, ghOwner, ghToken, listSecrets, markerPrBody, openMarkerPr, repoExists, runCeremony } from "./repo.ts";

const main = async (): Promise<void> => {
  const args = parseArgs();
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }
  banner();

  // ---- the user's product, first: no external systems touched yet ---------
  const answers = await collectAnswers(args);

  const owner = args.owner ?? process.env.GITHUB_OWNER ?? ghOwner();

  summary(
    `Create ${answers.display}?`,
    [
      ["dir", answers.target],
      ["slug", answers.slug],
      ["domain", answers.domain],
      ["repo", answers.skipRepo ? "(skipped)" : `${owner}/${answers.slug}`],
      ["prod", `https://${answers.slug}.${answers.domain}`],
    ],
    ["This copies the template, renames every identity token, and wires CI."],
  );

  if (!args.yes) {
    const proceed = await confirm({ message: "Looks good?", initialValue: true });
    if (isCancel(proceed) || proceed === false) {
      outro("Nothing was written.");
      process.exit(0);
    }
  }

  // ---- local scaffold: the only hard requirement here is git -------------
  await phase("Scaffolding your product", async (ctx) => {
    if (!fs.existsSync(`${TEMPLATE_ROOT}/alchemy.run.ts`)) {
      fail(`Template source not found (expected ${TEMPLATE_ROOT}).`);
    }
    const email = run("git", ["config", "user.email"]);
    const name = run("git", ["config", "user.name"]);
    if (!email.ok || !name.ok) {
      fail(
        "git has no identity configured (the first commit would fail).\n" +
          `  Run: git config --global user.name "Your Name" && git config --global user.email "you@example.com"`,
      );
    }
    ctx.message("copying, renaming, fresh git history");
    const leftovers = scaffold(
      TEMPLATE_ROOT,
      answers.target,
      { slug: answers.slug, display: answers.display },
      answers.skipRepo
        ? null
        : {
            domain: answers.domain,
            sender: answers.sender,
            r2AccessKeyId: answers.r2AccessKeyId,
            r2SecretAccessKey: answers.r2SecretAccessKey,
            owner,
            repo: answers.slug,
          },
    );
    if (leftovers.length > 0) warn(`Identity tokens remain in: ${leftovers.join(", ")}`);
    ctx.done(`Scaffolded ${answers.slug} (fresh history, all identity tokens renamed)`);
  });

  await phase("Installing dependencies", async () => {
    const r = run("bun", ["install"], { cwd: answers.target });
    if (!r.ok) fail(`bun install failed: ${r.stderr}`);
  });

  if (answers.skipRepo) {
    summary(
      "Done (local only)",
      [["dir", answers.target]],
      [
        "When the repo is ready, from the project root:",
        `  gh repo create ${owner}/${answers.slug} --private --source . --remote origin --push`,
        "  bunx alchemy deploy stacks/github.ts --profile admin --stage bootstrap --yes",
      ],
    );
    outro("Happy shipping.");
    return;
  }

  // ---- repository: gh becomes a requirement here, not before -------------
  await phase(`Creating repository ${owner}/${answers.slug}`, async () => {
    if (!run("gh", ["auth", "status"]).ok) fail("GitHub CLI is not authenticated. Run: gh auth login");
    if (repoExists(`${owner}/${answers.slug}`)) {
      info(`Repo ${owner}/${answers.slug} already exists: adopting it.`);
      const { remote, push } = adoptRepo(`${owner}/${answers.slug}`, answers.target);
      if (!push.ok) fail(`git push failed: ${push.stderr}`);
      if (!remote.ok) info("Remote origin already set.");
    } else {
      const created = createRepo(`${owner}/${answers.slug}`, args.publicRepo, answers.target);
      if (!created.ok) fail(`gh repo create failed: ${created.stderr}`);
    }
  });

  // ---- Cloudflare credential + ceremony ----------------------------------
  const admin = await phase("Verifying your Cloudflare credential", () => resolveAdmin(args));
  info(admin.summary);

  await phase("Minting the CI token and writing repo secrets", async () => {
    const result = runCeremony(answers.target, ghToken());
    if (!result.ok) {
      fail(
        `The ceremony failed:\n${result.stderr.split("\n").slice(-15).join("\n")}\n` +
          "  Fix the cause, then rerun from the project root:\n" +
          "    bunx alchemy deploy stacks/github.ts --profile admin --stage bootstrap --yes",
      );
    }
    const present = listSecrets(`${owner}/${answers.slug}`);
    const missing = expectedSecrets().filter((name) => !present.has(name));
    if (missing.length > 0) fail(`Ceremony ran, but these repo secrets are missing: ${missing.join(", ")}`);
  });
  info(`All ${expectedSecrets().length} secrets verified in ${owner}/${answers.slug}`);

  let prUrl = "";
  await phase("Opening the marker PR", async () => {
    prUrl = openMarkerPr(answers.target, markerPrBody(answers.slug, answers.domain, answers.sender));
  });

  summary(
    `${answers.display} is live`,
    [
      ["repo", `github.com/${owner}/${answers.slug}`],
      ["marker", prUrl || "(open the PR from the repo page)"],
      ["local", `cd ${answers.target} && bun run dev`],
    ],
    [
      "Remaining setup is the checklist on the PR (email sender + branch",
      "protection). Merge when ready: prod deploys, and the first sign-in is",
      "the peace sign. Parallel agents: bun scripts/wt.ts <name> (see AGENTS.md).",
    ],
  );
  outro("Happy shipping.");
};

try {
  await main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

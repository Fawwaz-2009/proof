#!/usr/bin/env bun
/**
 * Copies the template into packages/create-proof/template/ so the
 * npm tarball carries the files the CLI scaffolds from. Runs automatically
 * via prepack/prepublishOnly; never edited by hand (gitignored).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { copyTemplate } from "../src/scaffold.ts";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const outDir = path.join(import.meta.dirname, "..", "template");

fs.rmSync(outDir, { recursive: true, force: true });
copyTemplate(repoRoot, outDir);

// The storefront landing (this repo's marketing page) belongs to this
// repository's own deploy only. Scaffolded apps get the starter page:
// "{App name} is live", built to be replaced. The swap happens here, at
// pack time, so the CLI never ships or branches on the storefront.
const storefrontIndex = path.join(outDir, "apps", "web", "src", "routes", "index.tsx");
const starterIndex = path.resolve(import.meta.dirname, "..", "scaffold", "index.tsx");
fs.copyFileSync(starterIndex, storefrontIndex);

let files = 0;
const count = (dir: string): void => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count(path.join(dir, entry.name));
    else files++;
  }
};
count(outDir);
console.log(`template synced: ${files} files -> ${path.relative(repoRoot, outDir)}`);

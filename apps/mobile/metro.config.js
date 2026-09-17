// Metro, monorepo-aware: this app lives in a bun workspace next to
// apps/backend (whose ./contract export is raw TypeScript the app imports)
// and apps/web. Metro must watch the workspace root and resolve modules from
// both node_modules layers. Hierarchical lookup must stay ON: bun installs
// packages under node_modules/.bun/<pkg>@<version>/node_modules/ with their
// own dependency folders, and Metro finds a package's deps by walking up
// from that real path.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules"), path.resolve(monorepoRoot, "node_modules")];

module.exports = config;

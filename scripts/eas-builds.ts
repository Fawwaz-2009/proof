// The seam between the pinned EAS CLI and the compatibility resolver.
//
// Everything here is shaped by what the installed CLI actually emits, verified
// against `node_modules/eas-cli/build/graphql/types/Build.js`: `build:list --json`
// prints the raw GraphQL fragment, so the fields are `isForIosSimulator`,
// `runtime.version`, `fingerprint.hash`, and `artifacts.buildUrl`. An adapter
// that guessed flat names (`runtimeVersion`, `simulator`, string `fingerprint`)
// silently produced candidates with no runtime and no fingerprint, and the
// resolver rejected every one of them.
//
// Pure functions on purpose: the mapping and the query shape are the parts that
// broke, so they are the parts tests pin down, without an account or a build.
import type { MobileTargetId } from "../mobile-preview.config.ts";
import type { NativeBuild } from "./mobile-preview-resolver.ts";

type Json = Record<string, unknown>;

const asRecord = (value: unknown): Json => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {});
const asText = (source: Json, key: string): string | null => (typeof source[key] === "string" ? (source[key] as string) : null);

/**
 * Map the CLI's build records onto the resolver's shape.
 *
 * Both a cloud build and an artifact uploaded with `eas upload` produce a
 * record, and the listing reports neither development-launcher capability nor,
 * on older records, the artifact's target kind. Those stay `null`: the resolver
 * treats unknown as ineligible, so nothing is reused on an assumption. Capability
 * evidence has to come from the artifact (see scripts/eas-receipts.ts) or the
 * record is not a candidate at all.
 */
export const toNativeBuilds = (records: unknown): NativeBuild[] => {
  if (!Array.isArray(records)) return [];
  return records.flatMap((record) => {
    const value = asRecord(record);
    const platform = asText(value, "platform")?.toLowerCase();
    if (platform !== "ios" && platform !== "android") return [];
    const runtime = asRecord(value.runtime);
    const fingerprint = asRecord(value.fingerprint);
    const artifacts = asRecord(value.artifacts);
    const id = asText(value, "id");
    return [
      {
        id: id ?? "unknown",
        platform,
        simulator: typeof value.isForIosSimulator === "boolean" ? value.isForIosSimulator : null,
        appIdentifier: asText(value, "appIdentifier") ?? "",
        developmentClient: null,
        distribution: asText(value, "distribution"),
        runtimeVersion: asText(runtime, "version"),
        fingerprint: asText(fingerprint, "hash"),
        status: asText(value, "status") ?? "UNKNOWN",
        artifactUrl: asText(artifacts, "buildUrl"),
        profile: asText(value, "buildProfile"),
        createdAt: asText(value, "createdAt") ?? "",
        detailsUrl: id === null ? null : `https://expo.dev/builds/${id}`,
      },
    ];
  });
};

/**
 * The `build:list` arguments for one target.
 *
 * The lookup is narrowed by the native facts the provider can filter on
 * (`--app-identifier`, `--distribution`, `--fingerprint-hash`) instead of
 * paging the newest N builds and hoping: an unrelated recent build can then no
 * longer push a compatible one out of the window. `--fingerprint-hash` also
 * makes the fingerprint the discriminator, which is what reuse is keyed on.
 */
/** The candidate ids whose development-launcher capability must be verified before reuse. */
export const candidateIds = (builds: readonly NativeBuild[]): string[] => builds.map((build) => build.id);

export const buildLookupArgs = (target: MobileTargetId, appIdentifier: string, fingerprint: string | null): string[] => {
  const args = [
    "build:list",
    "--platform",
    target === "android" ? "android" : "ios",
    "--app-identifier",
    appIdentifier,
    "--distribution",
    "internal",
    "--limit",
    "30",
    "--json",
    "--non-interactive",
  ];
  if (fingerprint !== null) args.push("--fingerprint-hash", fingerprint);
  return args;
};

/**
 * The HTTPS page for a PR stage, derived the way every hostname in this stack
 * derives (apps/backend/config/domain.ts): `<slug>-<stage>.<ROOT_DOMAIN>`.
 * Without a zone the stage lives on `<worker>.<account>.workers.dev`, which
 * cannot be derived from identity alone, so the caller must pass the URL.
 */
export const stageUrlFor = (stage: string, appSlug: string | undefined, rootDomain: string | undefined): string | null =>
  appSlug === undefined || rootDomain === undefined ? null : `https://${appSlug}-${stage}.${rootDomain}`;

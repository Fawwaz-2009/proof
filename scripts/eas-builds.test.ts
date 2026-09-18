// The provider seam is where the pipeline broke: the adapter read invented flat
// field names, so real builds arrived with no runtime and no fingerprint and the
// resolver rejected every candidate. These tests pin the *installed* CLI's shape
// (`BuildFragmentNode` in eas-cli 24.7.0) and the query that narrows the lookup,
// so the failure cannot come back silently.
import { describe, expect, test } from "bun:test";
import { buildLookupArgs, stageUrlFor, toNativeBuilds } from "./eas-builds.ts";
import { resolveCompatibility } from "./mobile-preview-resolver.ts";

/** One finished internal iPhone development build, exactly as `build:list --json` prints it. */
const realBuild = {
  id: "b-1",
  status: "FINISHED",
  platform: "IOS",
  error: null,
  artifacts: { buildUrl: "https://expo.dev/artifacts/b-1", xcodeBuildLogsUrl: null, applicationArchiveUrl: null, buildArtifactsUrl: null },
  fingerprint: { id: "f-1", hash: "1dd3bdcfd2940b1b64be000df08817566c71a9fc" },
  initiatingActor: { __typename: "User", id: "u-1", displayName: "fawwaz-2009" },
  logFiles: [],
  app: { __typename: "App", id: "app-1", name: "proof", slug: "proof", ownerAccount: { id: "o-1", name: "fawwaz-2009" } },
  updateChannel: null,
  distribution: "INTERNAL",
  iosEnterpriseProvisioning: "UNKNOWN",
  buildProfile: "development",
  appIdentifier: "dev.fawwaz.proof.preview",
  sdkVersion: "57.0.0",
  appVersion: "1.0.0",
  appBuildVersion: "1",
  runtime: { id: "r-1", version: "1dd3bdcfd2940b1b64be000df08817566c71a9fc" },
  gitCommitHash: "4e5f300",
  gitCommitMessage: "mobile: wire local EAS commands",
  initialQueuePosition: null,
  queuePosition: null,
  estimatedWaitTimeLeftSeconds: null,
  priority: "NORMAL",
  createdAt: "2026-09-18T10:00:00.000Z",
  updatedAt: "2026-09-18T10:20:00.000Z",
  message: null,
  completedAt: "2026-09-18T10:20:00.000Z",
  expirationDate: null,
  isForIosSimulator: false,
  metrics: { buildWaitTime: 1, buildQueueTime: 1, buildDuration: 1 },
};

describe("build records", () => {
  test("a real finished iPhone build resolves as reusable for the device target", () => {
    const [build] = toNativeBuilds([realBuild]);
    expect(build).toBeDefined();
    const compatibility = resolveCompatibility(
      {
        target: "ios-device",
        appIdentifier: "dev.fawwaz.proof.preview",
        runtimeVersion: "1dd3bdcfd2940b1b64be000df08817566c71a9fc",
        fingerprint: "1dd3bdcfd2940b1b64be000df08817566c71a9fc",
      },
      [build!],
    );
    expect(compatibility.state).toBe("reusable");
  });

  test("the nested runtime and fingerprint are what carry compatibility", () => {
    const [build] = toNativeBuilds([realBuild]);
    expect(build?.runtimeVersion).toBe("1dd3bdcfd2940b1b64be000df08817566c71a9fc");
    expect(build?.fingerprint).toBe("1dd3bdcfd2940b1b64be000df08817566c71a9fc");
    expect(build?.appIdentifier).toBe("dev.fawwaz.proof.preview");
    expect(build?.profile).toBe("development");
    expect(build?.artifactUrl).toBe("https://expo.dev/artifacts/b-1");
  });

  test("a simulator artifact is a different target, not a match", () => {
    const [simulator] = toNativeBuilds([{ ...realBuild, isForIosSimulator: true }]);
    expect(simulator?.simulator).toBe(true);
    const compatibility = resolveCompatibility(
      {
        target: "ios-device",
        appIdentifier: "dev.fawwaz.proof.preview",
        runtimeVersion: "1dd3bdcfd2940b1b64be000df08817566c71a9fc",
        fingerprint: "1dd3bdcfd2940b1b64be000df08817566c71a9fc",
      },
      [simulator!],
    );
    expect(compatibility.state).toBe("native-build-required");
  });

  test("a record missing its runtime facts stays unusable instead of guessing", () => {
    const { runtime: _runtime, fingerprint: _fingerprint, ...withoutFacts } = realBuild;
    const [build] = toNativeBuilds([withoutFacts]);
    expect(build?.runtimeVersion).toBeNull();
    expect(build?.fingerprint).toBeNull();
    expect(resolveCompatibility({ target: "ios-device", appIdentifier: "dev.fawwaz.proof.preview", runtimeVersion: "x", fingerprint: "y" }, [build!]).state).toBe(
      "native-build-required",
    );
  });

  test("non-records contribute nothing", () => {
    expect(
      toNativeBuilds([{ platform: "ANDROID", id: "a-1", runtime: { version: "v" }, fingerprint: { hash: "h" }, artifacts: {} }]).map((build) => build.platform),
    ).toEqual(["android"]);
    expect(toNativeBuilds("nope")).toEqual([]);
    expect(toNativeBuilds([null, 42])).toEqual([]);
  });
});

describe("lookup shape", () => {
  test("the query is narrowed by the native facts, not paged blindly", () => {
    const args = buildLookupArgs("ios-device", "dev.fawwaz.proof.preview", "1dd3bdcd");
    expect(args).toContain("--app-identifier");
    expect(args).toContain("dev.fawwaz.proof.preview");
    expect(args).toContain("--distribution");
    expect(args).toContain("internal");
    expect(args).toContain("--fingerprint-hash");
    expect(args).toContain("1dd3bdcd");
    expect(args).toContain("ios");
  });

  test("the simulator target queries its own platform and skips the fingerprint filter when unknown", () => {
    expect(buildLookupArgs("ios-simulator", "dev.fawwaz.proof.preview", null)).not.toContain("--fingerprint-hash");
    expect(buildLookupArgs("android", "dev.fawwaz.proof.preview", "h")).toContain("android");
  });
});

describe("stage url", () => {
  test("derives the documented stage hostname", () => {
    expect(stageUrlFor("pr-12", "proof", "fawwaz.dev")).toBe("https://proof-pr-12.fawwaz.dev");
  });

  test("without identity it declines instead of guessing a host", () => {
    expect(stageUrlFor("pr-12", "app", undefined)).toBeNull();
    expect(stageUrlFor("pr-12", undefined, "fawwaz.dev")).toBeNull();
  });
});

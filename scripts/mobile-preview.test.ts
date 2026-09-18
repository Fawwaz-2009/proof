// The compatibility resolver decides whether a reviewer's phone reuses an
// artifact or waits for a build, so every rejection boundary is pinned here: a
// wrong target, a wrong identity, or missing metadata must never resolve to
// "reusable". Config validation is pinned too, because the file is hand-edited.
import { describe, expect, test } from "bun:test";
import { type MobilePreviewConfig, mobilePreviewConfig, validateMobilePreviewConfig } from "../mobile-preview.config.ts";
import { type NativeBuild, rejectionFor, resolveCompatibility } from "./mobile-preview-resolver.ts";

const deviceBuild: NativeBuild = {
  id: "build-1",
  platform: "ios",
  simulator: false,
  appIdentifier: "dev.fawwaz.proof.preview",
  developmentClient: true,
  distribution: "INTERNAL",
  runtimeVersion: "1dd3bdcfd2940b1b64be000df08817566c71a9fc",
  fingerprint: "1dd3bdcfd2940b1b64be000df08817566c71a9fc",
  status: "FINISHED",
  artifactUrl: "https://expo.dev/artifacts/build-1",
  profile: "development",
  createdAt: "2026-09-18T10:00:00.000Z",
  detailsUrl: "https://expo.dev/builds/build-1",
};

const wanted = {
  target: "ios-device" as const,
  appIdentifier: "dev.fawwaz.proof.preview",
  runtimeVersion: deviceBuild.runtimeVersion!,
  fingerprint: deviceBuild.fingerprint!,
};

describe("config validation", () => {
  test("the committed default is usable and names its targets", () => {
    expect(validateMobilePreviewConfig(mobilePreviewConfig)).toEqual([]);
  });

  test("a blank environment, an empty profile, and an unbounded wait are each reported", () => {
    const broken: MobilePreviewConfig = {
      ...mobilePreviewConfig,
      environment: "  ",
      waitForRunningBuildSeconds: 10_000,
      targets: { ...mobilePreviewConfig.targets, android: { ...mobilePreviewConfig.targets.android, profile: "" } },
    };
    const problems = validateMobilePreviewConfig(broken);
    expect(problems.length).toBe(3);
    expect(problems.join(" ")).toContain("environment is blank");
    expect(problems.join(" ")).toContain("targets.android.profile is blank");
    expect(problems.join(" ")).toContain("waitForRunningBuildSeconds");
  });

  test("a missing target entry is reported instead of throwing", () => {
    const incomplete = {
      ...mobilePreviewConfig,
      targets: { "ios-device": mobilePreviewConfig.targets["ios-device"], "ios-simulator": mobilePreviewConfig.targets["ios-simulator"] },
    } as unknown as MobilePreviewConfig;
    expect(validateMobilePreviewConfig(incomplete).join(" ")).toContain("targets.android is missing");
  });
});

describe("native compatibility", () => {
  test("a matching device build is reusable, with the provisioning caveat", () => {
    const result = resolveCompatibility(wanted, [deviceBuild]);
    expect(result.state).toBe("reusable");
    if (result.state !== "reusable") return;
    expect(result.build.id).toBe("build-1");
    expect(result.note).toContain("provisioning profile");
  });

  test("a simulator artifact never satisfies an iPhone target, nor the reverse", () => {
    expect(rejectionFor(wanted, { ...deviceBuild, simulator: true })).toBe("simulator artifact");
    expect(rejectionFor({ ...wanted, target: "ios-simulator" }, deviceBuild)).toBe("device artifact");
  });

  test("another app identity is rejected even with identical runtime facts", () => {
    expect(rejectionFor(wanted, { ...deviceBuild, appIdentifier: "dev.fawwaz.proof" })).toBe("app identity dev.fawwaz.proof");
  });

  test("unknown runtime facts are rejections, not matches", () => {
    expect(rejectionFor(wanted, { ...deviceBuild, runtimeVersion: null })).toBe("runtime version not recorded");
    expect(rejectionFor(wanted, { ...deviceBuild, fingerprint: null })).toBe("fingerprint not recorded");
    expect(rejectionFor(wanted, { ...deviceBuild, runtimeVersion: "0theroldhash" })).toBe("runtime version 0theroldhash");
    expect(rejectionFor(wanted, { ...deviceBuild, fingerprint: "0theroldhash" })).toBe("fingerprint 0theroldhash");
  });

  test("store, non-development-client, and non-internal builds are rejected", () => {
    expect(rejectionFor(wanted, { ...deviceBuild, developmentClient: false })).toBe("not a development client build");
    expect(rejectionFor(wanted, { ...deviceBuild, distribution: "STORE" })).toBe("distribution STORE");
  });

  test("an uploaded local build with no cloud profile still matches on its native facts", () => {
    expect(rejectionFor(wanted, { ...deviceBuild, profile: null })).toBeNull();
  });

  test("a running matching build reports as building, and a finished one outranks it", () => {
    const running = { ...deviceBuild, id: "build-running", status: "IN_PROGRESS", artifactUrl: null, createdAt: "2026-09-18T11:00:00.000Z" };
    expect(resolveCompatibility(wanted, [running]).state).toBe("building");
    const finished = resolveCompatibility(wanted, [running, deviceBuild]);
    expect(finished.state).toBe("reusable");
    if (finished.state === "reusable") expect(finished.build.id).toBe("build-1");
  });

  test("a finished build without an artifact is not reusable", () => {
    const result = resolveCompatibility(wanted, [{ ...deviceBuild, artifactUrl: null }]);
    expect(result.state).toBe("native-build-required");
    if (result.state !== "native-build-required") return;
    expect(result.reason).toContain("artifact missing");
  });

  test("among equals the newest build wins", () => {
    const older = { ...deviceBuild, id: "build-old", createdAt: "2026-09-17T10:00:00.000Z" };
    const newer = { ...deviceBuild, id: "build-new", createdAt: "2026-09-18T12:00:00.000Z" };
    const result = resolveCompatibility(wanted, [older, newer]);
    if (result.state !== "reusable") throw new Error(`expected reusable, got ${result.state}`);
    expect(result.build.id).toBe("build-new");
  });

  test("no candidates at all explains itself instead of claiming a mismatch", () => {
    const result = resolveCompatibility(wanted, []);
    expect(result.state).toBe("native-build-required");
    if (result.state !== "native-build-required") return;
    expect(result.reason).toBe("no builds exist for this project and target");
  });

  test("a runtime mismatch is surfaced as the reason when that is the failing check", () => {
    const result = resolveCompatibility(wanted, [{ ...deviceBuild, runtimeVersion: "0theroldhash", fingerprint: "0theroldhash" }]);
    if (result.state !== "native-build-required") throw new Error(`expected native-build-required, got ${result.state}`);
    expect(result.reason).toContain("runtime version 0theroldhash");
  });
});

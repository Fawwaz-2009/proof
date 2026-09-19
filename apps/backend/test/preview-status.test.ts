import { describe, expect, test } from "bun:test";
import { type DeploymentStamp, toPreviewStatus } from "../src/domain/preview.ts";

const stamp: DeploymentStamp = { stage: "pr-12", revision: "bbbbbbb", deploymentId: "run-1-1" };

/**
 * The staleness rules of the preview status endpoint. Every consumer treats
 * `record !== null` as "this deployment published a mobile preview for this
 * stage", so a malformed, foreign, or unexpected-schema object must collapse to
 * `null` rather than be served as live status.
 */

const record = {
  schemaVersion: 1,
  repository: "Fawwaz-2009/proof",
  prNumber: 12,
  stage: "pr-12",
  headCommit: "aaaaaaa",
  testedCommit: "bbbbbbb",
  deploymentId: "run-1-1",
  updatedAt: "2026-09-18T12:00:00.000Z",
  workflowRunUrl: "https://github.com/Fawwaz-2009/proof/actions/runs/1",
  targets: {
    "ios-device": {
      state: "ready",
      reasonCode: null,
      humanMessage: null,
      nativeFingerprint: "1dd3bdcd",
      runtimeVersion: "1dd3bdcd",
      appIdentifier: "dev.fawwaz.proof.preview",
      build: { id: "build-1", installUrl: "https://expo.dev/artifacts/build-1", provider: "local", target: "ios-device", verifiedAt: "2026-09-18T11:00:00.000Z" },
      update: { groupId: "group-1", deepLink: "proof-preview://expo-development-client/?url=…", publishedAt: "2026-09-18T12:00:00.000Z" },
    },
  },
};

describe("preview status", () => {
  test("a record whose freshness cannot be established is never served", () => {
    // The stale-preview defect: a PR's bucket persists between pushes, so a
    // record written by an earlier deployment of the same stage must not be
    // served as if it described the code now answering.
    expect(toPreviewStatus("pr-12", "preview", JSON.stringify(record), null).record).toBeNull();
    expect(toPreviewStatus("pr-12", "preview", JSON.stringify(record), { ...stamp, deploymentId: "run-2-1" }).record).toBeNull();
    expect(toPreviewStatus("pr-12", "preview", JSON.stringify(record), { ...stamp, revision: "ccccc" }).record).toBeNull();
    expect(toPreviewStatus("pr-12", "preview", JSON.stringify(record), { ...stamp, stage: "pr-9" }).record).not.toBeNull();
  });

  test("no object means no record", () => {
    const status = toPreviewStatus("pr-12", "preview", null);
    expect(status).toEqual({ stage: "pr-12", environment: "preview", record: null });
  });

  test("a valid record is decoded, targets included", () => {
    const status = toPreviewStatus("pr-12", "preview", JSON.stringify(record), stamp);
    expect(status.record?.testedCommit).toBe("bbbbbbb");
    expect(status.record?.targets["ios-device"]?.state).toBe("ready");
    expect(status.record?.targets["ios-device"]?.update?.groupId).toBe("group-1");
  });

  test("malformed JSON, an unknown schema version, and a missing field are all absent", () => {
    expect(toPreviewStatus("pr-12", "preview", "{").record).toBeNull();
    expect(toPreviewStatus("pr-12", "preview", JSON.stringify({ ...record, schemaVersion: 2 }), stamp).record).toBeNull();
    const { testedCommit: _dropped, ...withoutCommit } = record;
    expect(toPreviewStatus("pr-12", "preview", JSON.stringify(withoutCommit), stamp).record).toBeNull();
    expect(toPreviewStatus("pr-12", "preview", JSON.stringify({ ...record, targets: { "ios-device": { state: "not-a-state" } } }), stamp).record).toBeNull();
  });

  test("a record written for another stage is refused", () => {
    expect(toPreviewStatus("pr-13", "preview", JSON.stringify(record), stamp).record).toBeNull();
  });

  test("production never serves a record, whatever the bucket holds", () => {
    expect(toPreviewStatus("prod", "prod", JSON.stringify(record), stamp).record).toBeNull();
  });
});

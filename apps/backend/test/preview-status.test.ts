import { describe, expect, test } from "bun:test";
import { toPreviewStatus } from "../src/domain/preview.ts";

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
  test("no object means no record", () => {
    const status = toPreviewStatus("pr-12", "preview", null);
    expect(status).toEqual({ stage: "pr-12", environment: "preview", record: null });
  });

  test("a valid record is decoded, targets included", () => {
    const status = toPreviewStatus("pr-12", "preview", JSON.stringify(record));
    expect(status.record?.testedCommit).toBe("bbbbbbb");
    expect(status.record?.targets["ios-device"]?.state).toBe("ready");
    expect(status.record?.targets["ios-device"]?.update?.groupId).toBe("group-1");
  });

  test("malformed JSON, an unknown schema version, and a missing field are all absent", () => {
    expect(toPreviewStatus("pr-12", "preview", "{").record).toBeNull();
    expect(toPreviewStatus("pr-12", "preview", JSON.stringify({ ...record, schemaVersion: 2 })).record).toBeNull();
    const { testedCommit: _dropped, ...withoutCommit } = record;
    expect(toPreviewStatus("pr-12", "preview", JSON.stringify(withoutCommit)).record).toBeNull();
    expect(toPreviewStatus("pr-12", "preview", JSON.stringify({ ...record, targets: { "ios-device": { state: "not-a-state" } } })).record).toBeNull();
  });

  test("a record written for another stage is refused", () => {
    expect(toPreviewStatus("pr-13", "preview", JSON.stringify(record)).record).toBeNull();
  });

  test("production never serves a record, whatever the bucket holds", () => {
    expect(toPreviewStatus("prod", "prod", JSON.stringify(record)).record).toBeNull();
  });
});

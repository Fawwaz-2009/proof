// The reviewer-facing format: the deep link Expo documents for development
// builds, and a comment that never claims more than the run established.
import { describe, expect, test } from "bun:test";
import { MARKER, commentBodyFor, deepLinkFor, installHintFor, updateGroupUrl } from "./mobile-preview-comment.ts";

describe("deep link", () => {
  test("matches Expo's documented development-build format", () => {
    const link = deepLinkFor({ scheme: "proof-preview", projectId: "1e9b19eb-9be2-4c2f-b4ba-404811931171", groupId: "b82c3f5f-6334-44d1-83d7-73af1f56e0ce" });
    expect(link).toBe("proof-preview://expo-development-client/?url=https://u.expo.dev/1e9b19eb-9be2-4c2f-b4ba-404811931171/group/b82c3f5f-6334-44d1-83d7-73af1f56e0ce");
    expect(updateGroupUrl("p", "g")).toBe("https://u.expo.dev/p/group/g");
  });
});

describe("comment", () => {
  const base = {
    stageUrl: "https://proof-pr-99.fawwaz.dev",
    revision: "aed30bb8135ddd6e10461f952a389e0ea24c72d4",
    runtimeVersion: "1dd3bdcfd2940b1b64be000df08817566c71a9fc",
    workflowRunUrl: "https://github.com/o/r/actions/runs/1",
    installHint: installHintFor("1dd3bdcfd2940b1b64be000df08817566c71a9fc"),
  };

  test("ready carries the link and the honest install caveat", () => {
    const body = commentBodyFor({ ...base, link: "proof-preview://x", state: "ready" });
    expect(body.startsWith(MARKER)).toBe(true);
    expect(body).toContain("proof-preview://x");
    expect(body).toContain("cannot see what is installed on your phone");
    expect(body).toContain("aed30bb");
  });

  test("failed never advertises a link, and states the reason", () => {
    const body = commentBodyFor({ ...base, link: null, state: "failed", reason: "the update could not be published: network" });
    expect(body).toContain("Not usable yet");
    expect(body).toContain("network");
    expect(body).not.toContain("Open on your phone");
  });

  test("the hint names the rebuild command for the target", () => {
    expect(installHintFor("1dd3bdcfd2940b1b64be000df08817566c71a9fc")).toContain("bunx expo run:ios --device");
    expect(installHintFor("1dd3bdcfd2940b1b64be000df08817566c71a9fc", "android")).toContain("bunx expo run:android --device");
    expect(installHintFor(null)).toContain("the runtime this revision needs");
  });

  test("unknown revision and runtime are labelled, not guessed", () => {
    const body = commentBodyFor({ ...base, revision: null, runtimeVersion: null, link: null, state: "failed" });
    expect(body).toContain("unknown");
    expect(body).toContain("not determined");
  });
});

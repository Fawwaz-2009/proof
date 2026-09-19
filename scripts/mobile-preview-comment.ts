// The reviewer-facing artifacts of a published update: the link a phone opens,
// and the comment a PR carries.
//
// The deep link format is Expo's documented one for development builds
// (docs.expo.dev/eas-update/expo-dev-client): the app's own registered scheme,
// the `expo-development-client` host, and the update's URL as the `url`
// parameter. It is deliberately built from the *update group* rather than from
// a channel: a channel moves, a group does not, so the link a reviewer keeps
// still points at the revision they were reviewing.
//
// Pure so the format, which is the whole point of this module, is pinned by
// tests rather than by whichever run happened to work.

/** `https://u.expo.dev/<projectId>` is `updates.url` in the app config. */
export const updatesUrlFor = (projectId: string): string => `https://u.expo.dev/${projectId}`;

export const updateGroupUrl = (projectId: string, groupId: string): string => `${updatesUrlFor(projectId)}/group/${groupId}`;

/**
 * The deep link a phone opens. `scheme` is the app's registered scheme, which
 * the preview variant derives as `<APP_SLUG>-preview` in app.config.ts.
 */
export const deepLinkFor = (options: { scheme: string; projectId: string; groupId: string }): string =>
  `${options.scheme}://expo-development-client/?url=${updateGroupUrl(options.projectId, options.groupId)}`;

export const MARKER = "<!-- proof-mobile-preview -->";

/**
 * The PR comment body.
 *
 * Two things it must not do: claim the command knows what is installed on the
 * reviewer's phone, and claim a preview is ready when the publication failed.
 * The runtime id is stated because it is the one fact that explains "this link
 * did nothing": an app installed from a different native build cannot load this
 * update and must be rebuilt.
 */
export const commentBodyFor = (options: {
  readonly link: string | null;
  readonly state: "ready" | "failed";
  readonly reason?: string;
  readonly stageUrl: string;
  readonly revision: string | null;
  readonly runtimeVersion: string | null;
  readonly workflowRunUrl: string | null;
  readonly installHint: string;
}): string => {
  const lines = [MARKER, "## Mobile preview", ""];
  if (options.state === "ready" && options.link !== null) {
    lines.push(
      `**Open on your phone:** [${options.link}](${options.link})`,
      "",
      "Tap it on the phone that already has the preview app installed. It opens this PR's version against this PR's backend; nothing needs to be running on anyone's laptop.",
      "",
    );
  } else {
    lines.push(`**Not usable yet.** ${options.reason ?? "The update could not be published."}`, "");
  }
  lines.push(
    "| | |",
    "| --- | --- |",
    `| Backend | ${options.stageUrl} |`,
    `| Tested revision | ${options.revision === null ? "unknown" : `\`${options.revision.slice(0, 7)}\``} |`,
    `| Native runtime | ${options.runtimeVersion === null ? "not determined" : `\`${options.runtimeVersion.slice(0, 12)}\``} |`,
  );
  if (options.workflowRunUrl !== null) lines.push(`| Run | ${options.workflowRunUrl} |`);
  lines.push("", options.installHint, "");
  return lines.join("\n");
};

/** The first-run hint: what to do when the link does nothing. */
export const installHintFor = (runtimeVersion: string | null): string =>
  runtimeVersion === null
    ? "This command cannot tell what is installed on your phone. If the link does nothing, install a development build for this revision."
    : `This command cannot tell what is installed on your phone. If the link does nothing, your installed app was built from a different native runtime; rebuild and reinstall it (\`bun run mobile:doctor\` reports the toolchain, and the native-build path is the next milestone).`;

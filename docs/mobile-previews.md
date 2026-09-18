# Mobile PR previews

Status: proposed workflow, documented before implementation. The current
PR preview workflow deploys the website and backend. This guide does not
claim that mobile publishing, build reuse, or preview switching is already
wired into CI. The mobile client is being introduced in
[PR #4](https://github.com/Fawwaz-2009/proof/pull/4).

The intended experience is the same proof loop: open a PR, test its complete
frontend and backend, request changes, and return to the updated preview.
Several PR environments remain available concurrently.

**Whose app is installed on the phone?**

The project's own development build, with Expo's `expo-dev-client` and
`expo-updates` included. It contains the native capabilities needed to run
compatible versions of this project. It is separate from Expo Go and should
have a preview identity distinct from the production app.

Expo already supplies the development launcher and the ability to open a
specific published update. An update link identifies the project and update
group; opening it or scanning its QR code selects that version. No shaking
or custom version-picker screen is required for this path. The built-in
Extensions tab is another way to browse published updates after signing
into an Expo account with project access.
[Expo: preview updates in development builds](https://docs.expo.dev/eas-update/expo-dev-client/).

**Do we need to build a version picker?**

The recommended first version uses GitHub as the picker. Each PR has its
own HTTPS preview link and QR code. The HTTPS page can offer an Open on
iPhone action that launches the native deep link; this avoids depending on
GitHub or an email client accepting a custom URL scheme directly. On a
desktop, scan the QR code with the phone. A custom list of PRs inside the
app can be added later if reviewers need it.

The template still needs to generate these links, associate each update
with the correct backend, expose installation instructions, and display the
PR and revision being reviewed. Expo provides the launcher; this repository
owns the review experience and isolation rules.

**What happens when an agent finishes an issue?**

The proposed pipeline keeps the existing handoff:

1. The agent works in an isolated worktree, runs `bun run check`, and opens
   a PR with the proof brief.
2. CI deploys the PR's website and backend stage, then prepares an iOS
   update from the same source revision with that stage's API URL.
3. CI checks native compatibility and availability of a usable build. It
   publishes the update when there is a compatible build. Otherwise it
   reports that a native build is required and applies the repository's
   build-spending policy.
4. The PR's preview comment links to a page showing the latest ready mobile
   revision, its QR code, and the matching build's installation link. A PR
   merely existing does not mean its mobile preview is ready.
5. After feedback, another push repeats the process. The comment advances
   to the newly ready revision; other PR environments stay available.

GitHub remains the place to find the result. Email or app notifications
depend on the reviewer's GitHub settings. Expo documents a GitHub Action
that publishes updates and comments with a QR code; our workflow must add
backend coordination and compatibility handling.
[Expo: GitHub PR previews](https://docs.expo.dev/eas-update/github-actions/).

An illustrative ready state, not a feature currently implemented:

```text
Mobile preview: PR 21, revision abc123
Ready using an existing compatible iPhone build

Open mobile preview page | QR code | Install compatible build
Backend: pr-21
```

The first review requires device enrollment and installation of the preview
app. After that, a compatible update opens through its link, subject to the
phone's normal open-app confirmation. An incompatible or missing installed
build adds an installation step. Ad hoc distribution requires Apple
Developer membership and registered devices; adding a device can sometimes
be handled by re-signing an existing build.
[Expo: internal distribution](https://docs.expo.dev/build/internal-distribution/).

**How does the agent know whether another build is necessary?**

CI should calculate this, rather than rely on the agent guessing from the
diff. Expo's fingerprint represents inputs that can affect native
compatibility. Keep the fingerprint runtime policy as the compatibility
check; do not force a match by removing native inputs or assigning an old
runtime version. Native code changes can require a new installed binary.
[Expo: runtime versions](https://docs.expo.dev/eas-update/runtime-versions/).

The proposed decision is:

```text
Calculate the iOS fingerprint for this PR and preview configuration
  -> matching usable build exists: reuse it and publish the update
  -> matching build is in progress: wait for that build
  -> no matching build: report Native build required
```

Look up builds within the adopter's Expo project using the fingerprint,
preview app identity/profile, platform, and device versus simulator target.
Also check successful completion, artifact availability, and signing/device
eligibility. A server having a compatible build does not mean the reviewer
has installed it. Show its installation link in either case.

Do not require the build's Git commit to equal the PR's commit: the purpose
is to reuse a compatible native binary across many JavaScript revisions.
Do not compare only against the previous commit or `main`: an unchanged
fingerprint does not prove that a usable build exists. Coalesce concurrent
requests for the same build. Expo's documented build lookup supports
fingerprint, profile, target, and waiting for an in-progress match; the same
decision can be orchestrated from our GitHub Actions pipeline.
[Expo: get-build job](https://docs.expo.dev/eas/workflows/pre-packaged-jobs/#get-build).

**How do worktrees fit?**

A worktree isolates source and local development; it is not a separate Expo
project or a reason to create another binary. For example:

| Worktree      | Local backend stage | Published PR stage / update branch | Native build                                              |
| ------------- | ------------------- | ---------------------------------- | --------------------------------------------------------- |
| image-notes   | dev-image-notes     | pr-21                              | Reuse compatible build A                                  |
| search-notes  | dev-search-notes    | pr-22                              | Reuse compatible build A                                  |
| native-camera | dev-native-camera   | pr-23                              | Build B if native fingerprint differs and no match exists |

Use `bun run wt <name>` and `bun run dev --stage dev-<name>`. When running
Metro concurrently, use distinct ports too. Keep the preview app identity
and Expo project ID stable across worktrees; do not put the PR number or
worktree path in native configuration. Intentional native changes produce
a different fingerprint. Each PR supplies its own API URL in JavaScript.
CI publishes from its clean checkout; it must not depend on an agent's
running Metro server or untracked local environment files.

Use an EAS update branch such as `pr-21` for each preview, with an ordinary
shared EAS environment for common configuration. A worktree or PR does not
need its own EAS environment. Build and update configuration must agree on
native identity. SDK 55+ requires `--environment` for EAS Update and does
not load local `.env` files on that path. Validate the final API URL and
prevent a common environment value from overriding the PR-specific URL.
[Expo: environment handling](https://docs.expo.dev/eas/environment-variables/usage/).

**How isolated are previews inside one installed app?**

Each PR should have its own frontend update and its own backend, accounts,
database, and files. Scope persisted credentials and local app data to the
backend origin, and reset in-memory state when switching versions. Opening
PR 22 must not replay PR 21's credentials or show its cached data. Saved
server data remains in its PR environment; unfinished forms are not
automatically preserved when switching.

One installed preview app runs one selected version at a time. Several PRs
can stay available, and several reviewers can open different PRs on their
own devices. They still share the installed app's native capabilities and
OS permissions. Namespacing local storage is an application convention, not
a security sandbox for untrusted code. Restrict credential-bearing preview
publishing to trusted contributions.

Separate installed apps with separate OS identities require distinct bundle
identifiers and builds. Use a stable preview variant alongside production;
avoid a new bundle identifier for every PR by default. Two simultaneous
PRs with incompatible native runtimes may require switching installed
builds, separate variants, or separate devices/simulators. One installation
cannot be assumed to run both.
[Expo: app variants](https://docs.expo.dev/build-reference/variants/).

**What should it cost?**

Pricing checked on 18 September 2026; recheck before making a budget. Free
includes up to 15 iOS cloud builds/month. Starter is $19/month with $45 build
credit, then usage charges. Medium iOS builds cost $2; large builds cost $4.
Free Update includes 1,000 monthly active installations, 100 GiB bandwidth,
and 20 GiB storage. These are account allowances, not a fresh allocation for
each worktree or PR. [Expo pricing](https://expo.dev/pricing).

Illustrative monthly Expo costs, assuming medium iOS builds, no other build
usage, and Update usage within the chosen plan's allowance:

| Native cloud builds | Free plan                 | Starter plan |
| ------------------- | ------------------------- | ------------ |
| 4                   | $0                        | $19          |
| 15                  | $0                        | $19          |
| 30                  | Beyond included allowance | $34          |
| 50                  | Beyond included allowance | $74          |

The Starter calculation is `$19 + max(0, $2 * builds - $45)`. These are
scenarios, not a forecast of how often this project's native code will
change. Device and simulator artifacts count separately; production builds,
other projects, and charged failed attempts also affect the allowance.
Apple membership, Cloudflare, CI usage, and taxes are separate.

A hundred compatible PR updates might reuse one initial phone build. OTA
publications do not consume native-build credit. A device installation
downloading many updates counts once toward monthly active installations,
while downloads still use bandwidth.
[Expo: usage-based billing](https://docs.expo.dev/billing/usage-based-pricing/).

**What keeps costs predictable?**

- Reuse builds by compatibility across PRs and worktrees; wait for a matching
  build in progress instead of submitting another one.
- Recommended default: publish compatible updates automatically and require
  an explicit action for new cloud native builds. Teams can opt into
  automatic builds with an enforced budget. Exhausting the Free allowance
  should produce a clear status, not an implicit paid upgrade.
- Batch native dependency/configuration changes when practical. During
  active development, use Metro and local builds on a Mac. Local iOS
  compilation avoids cloud-build usage but still needs the toolchain and
  applicable signing. [Expo: local builds](https://docs.expo.dev/build-reference/local-builds/).
- Build only required targets. Do not create a cloud simulator artifact on
  every PR if reviewers only need the phone build.
- Skip superseded mobile publications and docs-only publications where
  appropriate. Preserve mobile review of backend changes: an unchanged
  frontend can still need an update that points at a new PR backend. Keep
  infrastructure deployment serialization intact.
- Publish the current ready revision, clean up closed PR update branches
  with their backend stages, and monitor actual usage. Keep the update
  orchestration in existing GitHub Actions unless EAS Workflows provides a
  needed feature; these are distinct CI usage budgets.

**What must be demonstrated before calling this implemented?**

Two PRs must open from their GitHub preview links in the same compatible
installed client, reach different backends, and retain separate sessions
when switching A to B to A. A native change must produce a clear build or
installation requirement. Concurrent compatible worktrees must reuse one
build. The reviewer must be able to identify the active PR and revision,
and a failed or stale publication must not be labeled ready. Closing a PR
must remove its preview resources. Merging web/backend changes does not by
itself install a new iOS binary; production mobile delivery needs a separate
release policy.

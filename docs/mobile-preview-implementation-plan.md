# Implementation plan: mobile PR previews with local builds preferred

Status: ready for implementation, not a claim that the workflow exists. Prepared
18 September 2026 against mobile PR #4 at `4e5f300` and documentation PR #5 at
`b3d793e`. Recheck the branches before editing. This plan incorporates the
owner's latest decisions, which supersede the older handoff's cloud-only build
decision and its exclusion of Android from template configuration.

## 1. Outcome and decisions

A reviewer opens a GitHub PR, follows its HTTPS mobile-preview link, and opens
that PR's frontend against that PR's isolated backend in the project's own
installed development app. Opening another PR's link switches to that preview.
Returning to the first PR restores its own session and server data. The agent
finishes with a usable preview or a precise explanation of the remaining setup
or native-build requirement.

Implement these decisions:

1. Keep Expo, `expo-dev-client`, `expo-updates`, and hosted EAS Update.
2. Reuse an existing compatible native build before compiling anything.
3. Prefer local compilation when a new native build is needed and the configured
   machine supports the target. Support an explicit cloud-build option per target.
4. Keep ordinary update publishing in GitHub Actions. A compatible PR update
   must not depend on a laptop, Metro, or a self-hosted runner being online.
5. Use GitHub and an HTTPS preview page as the version selector. Do not build a
   custom in-app PR browser in this iteration.
6. Use one stable preview app identity, separate from production, across PRs and
   worktrees. Keep per-PR URLs and revision labels in JavaScript, not native identity.
7. Make iPhone the owner's required target. Support optional simulator and
   Android target configuration and onboarding for adopters. Do not build every
   target automatically or claim Android device verification without doing it.
8. Each adopter owns their Expo project, credentials, accounts, and billing.
9. Keep production mobile releases out of this change. A merge deploying Workers
   does not distribute a new mobile binary or authorize a production OTA update.

This is a proposed implementation design. Concrete safety and review acceptance
criteria below are required; adjust a file boundary when repository evidence
supports a simpler implementation. Record such adjustments in the PR brief.

## 2. Existing work and known defects

Read these before implementation:

- [Mobile client PR #4](https://github.com/Fawwaz-2009/proof/pull/4).
- [Preview documentation PR #5](https://github.com/Fawwaz-2009/proof/pull/5).
- [Mobile preview guide](./mobile-previews.md) and root `AGENTS.md`.
- `.github/workflows/pr-preview.yml`, `alchemy.run.ts`, `website.ts`.
- `scripts/eas.ts`, `scripts/mobile-env.ts`, `scripts/wt.ts`.
- `apps/mobile/app.config.ts`, `apps/mobile/eas.json`, and `apps/mobile/src/lib/`.
- `apps/backend/config/auth.ts`, `storage.ts`, and `apps/backend/src/worker.ts`.

At the reviewed commit, PR #4 adds the app and EAS wrapper. The PR workflow only
deploys web/backend. Its `cleanup` job is in the same workflow file. There is no
separate mobile publisher, compatibility resolver, or mobile preview page yet.
`Prod readiness` is a configuration check, not proof that a mobile OTA works.

Fix these reproduced/source-verified issues before enabling mobile publishing:

| File                                     | Defect                                                                                                                       | Required result                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `scripts/eas.ts`                         | Mobile `.env` overwrites explicitly supplied process variables. A fixture turned a PR API URL into localhost.                | Explicit invocation/CI values win; local files only supply defaults.                                      |
| `scripts/mobile-env.ts`, `app.config.ts` | Missing root identity writes empty strings; nullish defaults retain them, producing empty name/slug/scheme and `dev.proof.`. | Normalize missing/blank identity; useful local defaults; distributable builds reject incomplete identity. |
| `apps/mobile/src/lib/auth-client.ts`     | `storagePrefix: appScheme` shares cookies and cached sessions between all PR origins.                                        | Namespace all persisted auth state by normalized backend origin and preview identity.                     |
| `apps/mobile/app.config.ts`              | Development and production share a bundle identifier.                                                                        | Stable, distinct preview and production identities with correct deep links and trusted origins.           |

The earlier review found that changing only `EXPO_PUBLIC_API_URL` between two
synthetic PR URLs did not change the iOS fingerprint in this configuration.
Repeat that invariant test after implementation. This observation does not prove
all JavaScript changes are fingerprint-neutral or that a real OTA opened on a device.

## 3. Work sequencing

Use an isolated worktree throughout. The existing implementation worktree can
continue PR #4; do not modify another agent's worktree or the shared main checkout.
Read the current branch and working-tree status before switching or rebasing.

Recommended delivery order:

1. Fix the mobile foundation defects and select preview identity before creating
   another shared native build. Rerun the current notes smoke flow on the new head.
2. Integrate the guide and this plan from PR #5 without overwriting the mobile
   agent's README/AGENTS/FAQ additions. Update documents around the combined state.
3. Implement the preview pipeline in a follow-up PR based on the mobile foundation.
   Follow the repository requirement for a final PR against `main`; state the
   dependency until the foundation is available there. Do not merge either PR on
   the owner's behalf merely to make the branch arrangement easier.
4. Complete the acceptance matrix and write the proof brief with working links.

Implement the phases below in order. Keep commits reviewable, but do not stop at
documentation, a mock preview page, or a plan if the task assigned to you is implementation.

## 4. Configuration and command contract

Add a small typed configuration file, proposed `mobile-preview.config.ts`, rather
than scattering mode flags across scripts. Use existing validation conventions.

Configuration must express:

- Whether mobile publishing is enabled for this clone. Web-only clones work
  without Expo credentials. Enabling mobile makes missing required setup an error.
- Enabled targets: `ios-device`, `ios-simulator`, `android`.
- Per-target native build mode: `local` or `cloud-manual`; default to `local`.
- The existing EAS development environment and the appropriate build profile.
- A bounded wait timeout for an already-running matching build.

Do not store tokens, per-clone project IDs, or owner-specific identities in this
committed file. Keep the existing development environment unless a concrete
reason requires migration. One shared environment is enough for PR updates.
Keep channels stable; create update branches `pr-N`, not a channel per PR.

Expose these proposed repository commands. They do not exist yet; implement and
document their actual arguments together:

| Command                                                     | Responsibility                                                                                                                                                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run mobile:doctor --target ios-device`                 | Check identity, project access, toolchain, target/profile, and signing prerequisites without starting a build or changing a subscription.                                                           |
| `bun run mobile:preview --pr N --target ios-device`         | Read the deployed PR revision, resolve compatibility, perform an allowed local build if needed, upload it, and request CI to finish publishing. Print the HTTPS preview URL or an actionable state. |
| `bun run mobile:build --target ios-device --provider local` | Build only after resolving/rechecking a cache miss; return structured artifact metadata. Used by the orchestrator, not a second independent implementation.                                         |
| `bun run mobile:preview:status --pr N --json`               | Return current revision, deployment identity, per-target state, and URLs without changing anything.                                                                                                 |

Add a manual GitHub workflow for native cloud builds and publication retries.
Its inputs identify the PR and target. It re-resolves the current deployment and
build need itself; it must not trust a supplied arbitrary SHA, URL, or fingerprint.
Selecting `cloud-manual` permits an explicit cloud action; it does not submit
cloud builds on every PR event. A failed local build must not silently fall back.

## 5. Identity, environment, and session fixes

### Stable native configuration

Keep the Expo project slug equal to the linked project's slug. A preview display
name can append `Preview`; it must not change the project slug.

Use a preview bundle identifier such as `<base>.preview` and a distinct explicit
scheme such as `<slug>-preview`. Production retains the original stable identity.
For Android, derive and validate the matching preview package identifier when
that target is enabled. Select the variant explicitly in build profiles and in
update/fingerprint commands; never infer it from an incidental `NODE_ENV` value.

Check the generated native URL schemes and the actual development-launcher link.
Do not assume changing `scheme` is sufficient without an installed-build test.
Update Better Auth trusted origins to accept the preview scheme on capture
stages and the production scheme on production. Do not add unrestricted wildcard
schemes or trust preview origins in production for convenience.

Keep `runtimeVersion: { policy: "fingerprint" }`. Preserve the already chosen
native encryption and scene configuration unless a verified requirement changes.
Treat this identity migration as a native change requiring a new installed app.

### Environment precedence

Use one shared configuration-resolution helper for the repository scripts:

1. Explicit invocation/CI values take precedence over local defaults.
2. Local `.env` loading is a convenience for developer commands; CI works without
   untracked files. Use a proper supported dotenv parser rather than extending
   several inconsistent line-based parsers.
3. Normalize blank optional values, validate required values for distribution,
   and preserve user-owned project/API values during `mobile:env` synchronization.
4. Do not let the wrapper forward backend/admin secrets unnecessarily to native
   bundling. Never log full environments or embed secrets in `EXPO_PUBLIC_*`.

For publishing, pass the EAS environment explicitly. SDK 55+ does not load local
`.env` files with that option. Remote EAS variables can override inherited values.
Keep dynamic PR URL, PR number, deployment ID, and revision out of shared remote
settings, or detect a collision and fail before publication. Verify the actual
exported public metadata, not only the parent shell's environment.
[EAS environment behavior](https://docs.expo.dev/eas/environment-variables/usage/).

Proposed bundle inputs are `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_PREVIEW_PR`,
`EXPO_PUBLIC_PREVIEW_REVISION`, and `EXPO_PUBLIC_PREVIEW_DEPLOYMENT_ID`. Read them
with Expo-supported literal property access. Do not place them in native config
or fingerprint exclusions. Native identity must resolve identically in local
builds, remote builds, fingerprint calculation, and update export.

### Storage and app state

Normalize the API origin using a URL parser, including nondefault ports. Derive
a deterministic SecureStore-safe namespace from that origin plus preview identity.
Use an available hash implementation or another unambiguous safe encoding; do
not add a large crypto package for this one task. Confirm the allowed key alphabet.

Both Better Auth's cookie and cached-session keys must use the namespace. Do not
migrate an old shared cookie into every PR namespace; require one fresh sign-in.
Scope any other persisted app data similarly. Clear or recreate query/mutation
state on preview load. Logout from B must not delete A's credentials. Production
must not read preview credentials. Native permissions still belong to the one
installed app; this is application-level separation, not an OS security boundary.

## 6. Define the preview record before wiring jobs

Use a validated versioned record consumed by the CLI, preview page, and PR
comment renderer. Proposed minimum shape, expressed here as a contract rather
than an instruction to hand-write redundant TypeScript types:

```text
schemaVersion
repository, prNumber, stage
headCommit, testedCommit, deploymentId, backendUrl
updatedAt, workflowRunUrl
targets[target]:
  state, reasonCode, humanMessage
  nativeFingerprint, runtimeVersion, appIdentifier
  build: { id, installUrl, provider, target, verifiedAt } | absent
  update: { groupId, deepLink, publishedAt } | absent
```

Track the PR head commit separately from the tested commit. Today's PR deploy
checks out GitHub's merge result. The backend and exported mobile update must
describe that same tested revision, not head in one place and merge SHA in another.

Use per-target states with explicit transitions:

| State                   | Meaning and next action                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `disabled`              | This target is intentionally not configured.                                                                                             |
| `setup-required`        | Missing project/credential/toolchain/signing setup; name the missing item.                                                               |
| `preparing`             | Backend is deployed; compatibility or publishing is running.                                                                             |
| `native-build-required` | No usable matching build; offer the local command or configured manual cloud workflow.                                                   |
| `building`              | A known build request is running; show where to follow it.                                                                               |
| `publishing`            | A usable native build exists; the current update is being published.                                                                     |
| `ready`                 | Current backend deployment, validated update, and usable native artifact are associated. Installation may still be needed on this phone. |
| `failed`                | Current attempt failed; keep reason and retry instructions.                                                                              |
| `stale`                 | Record/update belongs to a previous backend revision or deployment.                                                                      |
| `closed`                | PR is closed; no current preview is offered.                                                                                             |

Never infer what is installed on a phone from server records. The page can say
"Install a compatible app if needed"; it cannot certify the reviewer's installation.

## 7. Native compatibility resolver

Implement a resolver shared by the CLI and CI. Start read-only. Input: resolved
project, preview variant, target, native fingerprint, and distribution requirements.
Output: usable build, in-progress build, or a typed reason a new build is needed.

1. Calculate the fingerprint using the installed, pinned Expo/EAS toolchain and
   the same preview environment as the build/update. Save diagnostic sources as a
   private CI artifact when useful; keep tokens and absolute user paths out of PRs.
2. Query within the adopter's EAS project. Match platform, preview app identity,
   fingerprint/runtime, device versus simulator, and internal development-client
   capability. Check completed status, artifact availability, and known expiration.
3. Do not require the original build commit to equal this PR's commit.
4. Do not treat "same fingerprint as main" as evidence that an artifact exists.
5. Handle uploaded local builds as well as cloud builds. The installed EAS CLI
   `upload` command creates a local-build record, but it does not supply a cloud
   build profile in its metadata. A blanket build-profile filter may hide reusable
   local builds. Query broadly enough and validate actual native metadata.
6. For iPhone builds, include signing and device eligibility in usability. A
   matching runtime does not authorize a new device. Offer registration/re-signing
   instructions when appropriate, rather than recompiling without diagnosis.
7. Wait a bounded time for a matching running build, then report its status.
   Never submit another simply because a short polling interval elapsed.
8. Unknown or missing metadata is not a positive match. Inspect the artifact or
   its verified build receipt; do not guess its runtime or development-client status.

Expo documents fingerprint lookup and target filters in its
[build lookup job](https://docs.expo.dev/eas/workflows/pre-packaged-jobs/#get-build).
Use the CLI/API supported by the pinned version; importing undocumented EAS CLI
internals directly into product code is unnecessary coupling.

## 8. Local build and distribution path

### First prove the integration, then automate it

Before building a large workflow around assumptions, prove these steps on the
required iPhone target with a small real run during implementation:

1. Produce a signed internal development build locally with the preview profile.
2. Inspect the artifact's app identity, device/simulator target, embedded runtime,
   development-client capability, and provisioning metadata.
3. Upload it using `eas upload` and capture its JSON shareable URL.
4. Confirm the uploaded build is discoverable by the resolver and installable on
   the registered reviewer device. Record missing fields and the smallest verified
   supplemental receipt needed; do not silently treat null metadata as a match.
5. Open a published update from that installation with Metro stopped.

The installed EAS CLI 24.7.0 has `upload` handling for IPA, APK, and simulator
artifacts and a local-build mutation. The reviewed source supports this design;
an actual uploaded iPhone installation has not been verified by this plan's author.
The command's `--fingerprint` option can override metadata. Never use it to paper
over a mismatch: compare against the artifact's embedded runtime before supplying
a manual value. A shareable URL alone is not proof of installation or compatibility.
[Official upload command](https://docs.expo.dev/eas/cli/#eas-upload).

Illustrative underlying commands, after the wrapper and preview profiles are fixed:

```sh
bun run eas build --platform ios --profile development --local --output /absolute/path/preview.ipa
bun run eas upload --platform ios --build-path /absolute/path/preview.ipa --json --non-interactive
```

Use unique output paths generated by the orchestrator. Android uses its enabled
internal APK profile; a simulator artifact is a separate target. Do not upload
the same artifact repeatedly just because another PR can reuse it.

Prefer EAS's existing upload/distribution path over building an artifact hosting
service. If the real integration test exposes an unsupported case, document the
exact failure and a concrete distribution alternative before expanding scope.
Do not replace the requirement with a local file path that reviewers cannot use.

### Local build mechanics

- iOS requires macOS/Xcode and the needed signing/tools; Android requires its
  SDK/JDK toolchain. `mobile:doctor` reports missing components precisely.
- Separate daily incremental `expo run:*` development from distributable
  `eas build --local` output. EAS local build caching is not supported; do not
  advertise it as a faster incremental build system.
- Use a clean snapshot of the tested revision for publication. If a local agent
  is on PR head while CI deployed a merge revision, create an isolated temporary
  checkout of that tested commit. Do not reset the developer's worktree. Transfer
  only required configuration and clean up only directories this run created.
- Put build outputs, logs, and temporary native work outside tracked source; keep
  simultaneous worktrees from using the same working directory or output file.
- Share a local compatibility cache and exclusive lock through the repository's
  Git common directory, resolved using Git, not a guessed sibling path. Key by
  project/variant/target/fingerprint. Requery EAS after obtaining the lock.
- Serialize resource-heavy compilation on the configured machine. Handle crashed
  owners and stale locks with identifiable ownership and bounded recovery.
- V1 guarantees deduplication between worktrees on one configured build machine.
  Do not claim a filesystem lock deduplicates different machines. Document one
  native builder per target as the default; a multi-machine coordinator is a later
  extension. Cloud requests must use the one manual workflow and recheck reuse.
- Once the build is uploaded, trigger the publication-resume workflow for the PR.
  Let trusted CI write preview state and comments so the native builder does not
  need Cloudflare deployment credentials just to publish its build receipt.

[Local build support and limitations](https://docs.expo.dev/build-reference/local-builds/).

## 9. CI, state storage, and revision correctness

### Deploy output and preview state

Preserve the existing `preview-N` workflow serialization and
`cancel-in-progress: false` around Alchemy. Do not cancel a stateful deploy to save
an OTA publication. Expose validated deploy outputs (`url`, `bucketName`, tested
commit, deployment ID) for subsequent jobs instead of reconstructing hostnames.
This must work for custom domains and the existing workers.dev fallback.

Add a deployment stamp available through the public website's `/api/*` proxy:
stage, tested revision, deployment ID. Bind its values to the backend deployment.
Do not label a GitHub PR head SHA as the tested merge result.

For v1, store only public preview-status metadata in the existing PR stage's R2
bucket, under a reserved prefix. Proposed key:
`_proof/mobile/<testedCommit>/<deploymentId>.json`. Keep native binaries on Expo.

Trusted CI writes this object using the existing Cloudflare management credential
and the actual bucket output. Verify its R2 object-write permission; do not rotate
the bootstrap token ceremony merely for this change. R2 management permissions
are documented [here](https://developers.cloudflare.com/r2/api/tokens/).

Expose a read-only `GET /api/preview/mobile` that serves the record for the
backend's own deployed stamp. Follow the repository's contract/controller/domain/
config service boundaries. The endpoint must never accept an arbitrary R2 key or
expose notes, credentials, signing data, or raw logs. Restrict it to PR stages;
production returns unavailable. Use `Cache-Control: no-store` for current status.
There is no public write endpoint and no separate preview registry service.

Use a short, serialized per-PR finalization job for record/comment mutations in
both normal publication and resume runs. Recheck current PR/deployment state
inside that job. Route cleanup comment mutations through this boundary too.
The immutable deployment-specific key prevents an old run from
overwriting the status served for a new backend deployment. Concurrent resume
runs must not regress a ready state into an older failure; use a run/attempt
generation and a final re-read inside the serialization boundary. Merge target
results there so an Android completion cannot overwrite the iPhone entry. The
page always checks the live deployment stamp, even if a GitHub comment is stale.

### Publication flow

Extend `.github/workflows/pr-preview.yml` after successful deployment:

1. Guard enabled targets and trusted contributions. Disabled mobile leaves web
   behavior intact. Enabled-but-misconfigured mobile reports `setup-required`.
2. Verify the running backend stamp matches this run before publishing.
3. Resolve native compatibility for each enabled target.
4. If no match exists in local mode, record `native-build-required` and the local
   command. Do not attempt an iPhone build on Ubuntu or wait indefinitely for a Mac.
5. If a match exists, export/publish the update using explicit `--branch pr-N`,
   explicit environment, current stage URL, and tested revision. Never use `--auto`.
6. Validate the resolved/exported metadata and returned update group/runtime.
   Generate the deep link from the actual scheme, project ID, and group ID.
7. Immediately before advertising readiness, recheck that the PR is open and
   the backend still has this deployment stamp. Otherwise leave it superseded.
8. Write `ready`, read it through the public endpoint, and update the mobile PR
   comment. Surface publication/validation errors; do not swallow them into success.

The resume workflow accepts a PR number/target, resolves its latest deployment,
checks out the tested commit, and repeats compatibility/publication/finalization.
It does not redeploy an old backend to make a stale mobile bundle appear current.
For bootstrap before the resume workflow exists on the default branch, rerun
only the original mobile publishing job with `gh run rerun --job JOB_ID` after
uploading the local build. Keep the deploy output/stamp from the original deploy;
a mobile-only retry must not invent a new backend deployment ID from its new
run-attempt number. Abort if the original backend has since advanced. This lets
the new PR workflow be tested without merging unreviewed code. Once available on
the default branch, the dedicated resume workflow is the normal path.
[GitHub job rerun behavior](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs).

Deduplicate publication by platform, runtime, tested revision, and deployment
ID. Device and simulator entries can reference the same iOS update when their
runtime matches; different runtimes require their own compatible updates. On a
retry, reuse a verified already-published group rather than publishing another
identical update merely to repair the status record or PR comment.

A successful web deploy does not imply mobile readiness. Give the mobile result
its own clearly named status and document any required-check policy. A waiting
native build must not be presented to the reviewer as a passed mobile proof.

Start with publishing for every trusted PR deployment when mobile is enabled.
Backend-only changes must receive an update pointing at their backend. Defer
docs-only skipping until it can preserve the deployment/revision invariant.

### Cloud option

The manual cloud workflow uses the same resolver and artifact checks, acquires a
target/fingerprint concurrency group, then requeries before starting a cloud build.
Duplicate requests reuse/wait; they do not each call EAS Build. After success it
resumes the relevant PR publication, which rechecks that the PR is still current.

Show the selected platform/profile and that cloud allowance or paid usage applies.
No automatic plan upgrade, subscription change, or paid fallback. Failures and
quota exhaustion have distinct actionable reasons. Automated monthly spending
budgets and automatic cloud fallback are outside v1.

### Trust boundary

Use repository permissions and trusted contributions to gate any job that runs
PR code with Expo/Cloudflare credentials. Fork PRs must not get those credentials
or run on a maintainer's machine automatically. Do not solve missing fork secrets
by switching to privileged execution of untrusted PR code.

A self-hosted runner is optional later configuration, not a template prerequisite.
Default local builds are commands run by an authorized local agent/developer.
[GitHub guidance on runner and workflow security](https://docs.github.com/en/actions/reference/security/secure-use).

## 10. Reviewer experience

Add a route such as `/preview/mobile` in the existing web app. It reads the status
endpoint, shows each enabled target, and has these primary actions:

- Ready: **Open preview** and **Install preview app**, plus a QR code.
- No compatible build: **Build locally**, showing a copyable command. Offer
  **Build with Expo** only when that manual option is configured; link to the
  authenticated GitHub workflow rather than exposing build credentials in the page.
- Setup required: show the exact missing setup and the matching guide section.
- Building/publishing: show progress state and a workflow/build link.
- Failed/stale/closed: show the reason and next action; do not retain a misleading
  active Open button for an old update against a newer backend.

Show PR number, short tested revision, backend stage, last update time, and target.
Keep native fingerprints and diagnostic metadata in a secondary details section.
Do not add technical configuration forms to the reviewer's happy path.

The HTTPS page is the stable link posted on GitHub. Generate QR codes locally in
the page/build process, without a third-party QR service receiving preview links.
Use an explicit user tap to invoke the development-client deep link. Handle
browser restrictions with installation/help text; do not promise silent app opening.
An initial install or incompatible runtime adds an installation step.

Expo's built-in development client opens a specific update group. Use its
[documented URL format](https://docs.expo.dev/eas-update/expo-dev-client/) and test
the actual chosen scheme on the device. Do not replace this with an Expo Go link.

Keep the existing Alchemy-owned web preview comment intact. Use one separate
mobile comment with a stable hidden marker, updated by CI. Two independent
systems must not keep rewriting the same comment body. Include a compact status
per target and the HTTPS page link; use that same link in the proof brief.

Inside the native preview app, show a small persistent PR/revision/backend label.
Remove the preview label from production. On launch and foregrounding, compare
the bundle's deployment stamp with the backend. A mismatch asks the reviewer to
reopen the current GitHub preview. Prevent stale mobile mutations as well: send
the preview deployment ID on mobile API/auth requests and reject a mismatching
stamp on preview backends before mutations run. Preserve normal web requests and
production behavior. Test this guard, including the raw Better Auth route.

This matters because a PR URL is updated in place: an old mobile update does not
retain a historical backend after another push. V1 provides one current revision
per PR, not an indefinitely reproducible backend for every old commit.

## 11. Cleanup and retry behavior

Extend the existing close cleanup without weakening its `pr-*` protection:

1. Mark the mobile comment closed and prevent late finalizers from advertising
   readiness. Builders finishing later may upload reusable artifacts but must
   not publish a closed PR update.
2. Delete that PR's EAS update branch. Do not create per-PR channels that keep
   references to it. Verify whether branch deletion removes updates in the pinned
   CLI/service; delete remaining PR-owned update groups if necessary.
3. Destroy the PR stage with the current retry behavior. Status metadata disappears
   with its stage bucket. Expo and Cloudflare cleanup should both be attempted
   even if one fails; report failures for retry.
4. Keep native builds shared by other PRs. Do not delete a compatible binary just
   because the PR that originally triggered it closed.
5. Retrying cleanup treats already-absent branches/stages as success but does not
   hide authentication or permission errors.

Reopening a PR deploys a fresh stamp and publishes a fresh ready update. Never
restore a dead backend URL from an old comment. A closed HTTPS stage may return
404 after teardown; the GitHub comment remains the explanation. Do not retain
an extra deployed stage solely to serve a closed page.

Retain reusable native builds deliberately and document account storage usage.
Do not introduce an automatic destructive shared-build garbage collector in v1.

## 12. Acceptance checks

Add focused automated tests for configuration precedence, compatibility decisions,
session namespace construction, stale-result prevention, and cleanup safety.
Use fixtures/stubbed provider responses for failures and spending decisions.
Do not trigger real paid builds, real emails, or account mutations from tests.

| Scenario                                   | Required evidence                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Fresh clone without mobile setup           | Web checks still pass; mobile is disabled or clearly reports setup. No blank native identity is generated.               |
| Explicit PR URL vs local `.env`            | The actual spawned export receives the explicit URL. A remote EAS collision fails before publication.                    |
| Same source in two worktrees               | Native fingerprints agree under equivalent configuration; temp paths/PR metadata do not cause false differences.         |
| JS/API URL/revision-only change            | Compatible binary is reused. If fingerprint changes, inspect sources instead of suppressing native inputs.               |
| Native capability change                   | No matching artifact produces `native-build-required`; an existing matching artifact is reused.                          |
| Same fingerprint, wrong target or identity | Simulator/store/production or different-project artifacts are rejected.                                                  |
| Uploaded local artifact                    | Discoverable despite absent cloud profile; identity/runtime/target checks pass; installation link works.                 |
| Missing/expired artifact or signing        | Not ready; explain rebuild, re-signing, registration, or artifact recovery.                                              |
| Parallel local worktrees                   | One build on the configured host for a missing shared key; waiter reuses its uploaded result.                            |
| Local toolchain absent                     | Exact setup instructions; zero cloud submissions.                                                                        |
| Explicit cloud request repeated            | One matching workflow build; subsequent request reuses or waits.                                                         |
| Cloud quota or provider failure            | Honest failed/waiting status; no subscription change or automatic alternative charge.                                    |
| PR A and PR B                              | Both open from GitHub in the same installed compatible client, reach separate backends, and need no second native build. |
| A to B to A                                | Separate accounts, cookies, cached sessions, notes, and image URLs; B logout does not sign out A.                        |
| Laptop and Metro stopped                   | Published compatible updates remain usable from the phone.                                                               |
| Backend-only PR                            | Mobile update points at that PR's backend and identifies the matching tested revision.                                   |
| New push during build/publish              | Old run cannot mark the new deployment ready; stale native requests cannot mutate the new backend.                       |
| Publish/export failure                     | Mobile failure is visible while the web preview remains accessible.                                                      |
| Close during pending build                 | No late ready comment/update recreation; stage and PR updates cleaned; shared builds retained.                           |
| Untrusted fork                             | No publishing secrets, local runner execution, or cloud spend.                                                           |
| Preview vs production installed            | Distinct identities; preview deep link opens preview; no preview cookie/session access from production.                  |

For the required iPhone flow, record the tested device/OS, app build ID, update
group IDs, PR links, tested commits, and local-versus-cloud build origin. Stop
Metro and demonstrate OTP sign-in, notes list, image upload/render, delete,
sign-out/in, then A to B to A. On capture stages only, use the repository's
six-digit-address OTP convention. Never trigger a live email to invented inboxes.

Use a second real PR/backend for the isolation test; two mock URLs are insufficient.
Coordinate temporary validation PRs and remove their stages when finished. Keep
Android/simulator results explicitly marked not run when those targets lack a test
environment; do not advertise enabled production-quality support based on docs alone.

Run `bun run check` at the final combined implementation revision. Also run the
focused tests, validate workflow syntax, and perform the device checks above.
Passing `bun run check` alone cannot verify EAS publishing, signing, or deep links.

## 13. File-level implementation checklist

Exact helper filenames may change, but each responsibility must have one owner:

| Area                             | Files to change or add                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Environment/defaults             | `scripts/eas.ts`, `scripts/mobile-env.ts`, shared script configuration helper, `.env.example`                          |
| Target policy                    | Proposed `mobile-preview.config.ts`, root `package.json` scripts, validated config tests                               |
| Native identity                  | `apps/mobile/app.config.ts`, `apps/mobile/eas.json`, preview naming/icon treatment                                     |
| Auth and state                   | `apps/mobile/src/lib/auth-client.ts`, `env.ts`, API client, app layout/preview label, backend auth trusted origins     |
| Resolver and local orchestration | Proposed `scripts/mobile-preview.ts` with small helpers for compatibility, build/upload, status, and process execution |
| Deployment identity              | `alchemy.run.ts`, backend bindings/config and preview contract/routes; expose deploy outputs to CI                     |
| Public preview metadata          | Preview contract/controller/domain/config modules using existing stage R2 through the established service pattern      |
| Review page                      | New `apps/web/src/routes/preview/mobile.tsx` or equivalent router-conformant file                                      |
| Automation                       | `.github/workflows/pr-preview.yml`, manual native-build/resume workflow, stable mobile comment helper                  |
| Adoption docs                    | `docs/mobile-previews.md`, `docs/faq.md`, README, AGENTS, existing getting-started prompt if onboarding changes        |

Do not regenerate template package copies by hand if the repository has a generator.
Inspect the current template publication mechanism and update its source of truth.
Keep identity/secrets out of generated packages and test a fresh generated clone.

## 14. Documentation and completion handoff

Update the guide to describe what now exists, retaining clear labels for optional
or future features. Document these onboarding paths separately:

- iPhone on a Mac: local toolchain, Expo project/token, Apple credentials/device
  enrollment, first local build/upload/install, then PR links.
- iOS simulator: local artifact and separate target; no assertion it installs on
  a physical phone.
- Android: native toolchain, internal APK, installation steps, optional cloud mode.
- No suitable local machine: explicit cloud mode and its allowance/usage behavior.
- Web-only: no Expo setup required.

Explain local builds avoid EAS cloud compilation usage, while hosted update,
artifact storage/distribution, CI, Apple membership, and infrastructure may have
separate limits or costs. Verify actual local-upload entitlement and retention
with the current Expo account/docs before claiming unlimited free hosting.
Date any pricing examples; do not promise local compilation is always faster.

Keep these two limitations prominent, with official references:

- Native changes can require a new compatible installed build:
  [runtime compatibility](https://docs.expo.dev/eas-update/runtime-versions/).
- Separate installed apps/OS identities require distinct variants:
  [app variants](https://docs.expo.dev/build-reference/variants/).

The final proof brief must include the HTTPS preview page, exact device install
instructions, A/B switching steps, test evidence, and any remaining manual setup.
Use the repository's required `What changed`, `What fought back`, and
`How to check the proof` sections. State cloud builds actually submitted, if any.
Do not mark the mobile proof loop complete while the real required-device smoke
test or a critical distribution integration remains unverified.

Suggested skills for the implementation agent: `read-the-damn-docs`, `effect-ts`
for backend/schema work (satisfy its local Effect-source prerequisite before that
work), the repository's coding conventions, `react-doctor` for React changes,
and `quick-recap` for final status. Follow the current repository's Effect v4
service idiom when generic skill examples differ from it.

## 15. Supporting references

- [Expo development-client previews](https://docs.expo.dev/eas-update/expo-dev-client/)
- [Expo GitHub PR publishing](https://docs.expo.dev/eas-update/github-actions/)
- [EAS runtime compatibility](https://docs.expo.dev/eas-update/runtime-versions/)
- [EAS environments](https://docs.expo.dev/eas/environment-variables/usage/)
- [Local EAS builds](https://docs.expo.dev/build-reference/local-builds/)
- [Local incremental development](https://docs.expo.dev/guides/local-app-development/)
- [Local build upload](https://docs.expo.dev/eas/cli/#eas-upload)
- [Build lookup](https://docs.expo.dev/eas/workflows/pre-packaged-jobs/#get-build)
- [Internal distribution and device eligibility](https://docs.expo.dev/build/internal-distribution/)
- [App variants](https://docs.expo.dev/build-reference/variants/)
- [Build cache providers and physical iOS restrictions](https://docs.expo.dev/guides/cache-builds-remotely/)
- [Expo pricing](https://expo.dev/pricing) and [usage billing](https://docs.expo.dev/billing/usage-based-pricing/)

Do not conflate `expo run:*` cache providers with EAS local build caching or
assume simulator reuse demonstrates physical iPhone provisioning. Consult the
pinned CLI source when a documented command omits important response fields.

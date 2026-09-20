# Android browser previews: Phase 0 feasibility evidence

This file is the evidence record for the browser preview's first gate. The plan
is explicit that the hosted Android experience is not proven until a real
machine boots a real emulator behind a real public route, so nothing here may be
written from expectation. Every row is either a measurement with its command, or
it says "not measured".

Scope of this document: Phase 0 only. The platform, coordinator, reviewer page,
and PR automation are downstream of a passing gate.

## What Phase 0 has to answer

| Gate                  | Pass condition                                                                                                                                        | Status                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Hardware acceleration | Instance reports usable KVM and the emulator boots with acceleration actually in use. Software CPU emulation is a fail, not a slow pass.              | **partial pass**: `/dev/kvm` and `vmx` verified on the host; `emulator -accel-check` still to run |
| Hosted transport      | Video and input reach a browser over the public route with a maintained bridge, on desktop Chrome and phone Safari.                                   | not measured                                                                                      |
| Native app behaviour  | A self-contained APK of the current app, OTA disabled, installs and runs with no Metro server, against its own PR backend.                            | not measured                                                                                      |
| Concurrent isolation  | Two hosts serve two sessions with independent storage, auth, and controls.                                                                            | not measured                                                                                      |
| Performance           | Stopped host to interactive app within 180 s; reconnect to a running session within 10 s; p95 visible response within 500 ms over at least 20 inputs. | not measured                                                                                      |
| Cleanup               | Instance reaches `stopped`; probe resources delete; nothing billable is stranded.                                                                     | **pass, first run**: stack, instance, and volume all gone; verified through the AWS API           |
| Cost                  | Measured running cost per review-hour from actual usage, including egress.                                                                            | not measured                                                                                      |

A gate that misses keeps its measurements and gets a proposed adjustment. It
does not get reworded.

## Reproducible probe, as built

| Element               | Value                                                                                                                                                     | Where                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Region                | `ANDROID_PREVIEW_REGION`, falling back to the AWS CLI's `AWS_REGION` / `AWS_DEFAULT_REGION`. No code default: it decides cost, latency, and availability. | `.env.example`                        |
| Instance type         | `m7i.xlarge` as a documented starting point, `ANDROID_PREVIEW_INSTANCE_TYPE` to change                                                                    | `PROBE_DEFAULT_INSTANCE_TYPE`         |
| Nested virtualization | `CpuOptions.NestedVirtualization: enabled` in the launch template                                                                                         | `scripts/android-preview-template.ts` |
| AMI                   | pinned per region by `ANDROID_PREVIEW_AMI_ID`; never resolved to "latest"                                                                                 | required input                        |
| Root volume           | 50 GiB gp3, encrypted, deleted with the instance                                                                                                          | `PROBE_ROOT_VOLUME_GB`                |
| Bridge port           | 8080, loopback only, forwarded by the tunnel                                                                                                              | `PROBE_BRIDGE_PORT`                   |
| Host access           | SSM only. No inbound security group rules, no SSH key.                                                                                                    | template                              |
| Tunnel                | one Cloudflare Tunnel per probe, ingress to the local bridge, catch-all 404                                                                               | `stacks/android-preview-probe.ts`     |

Everything a clone must supply lives in `.env`, not in committed code: the
committed files say what a clone _may_ do, and never who or where it is. A
missing region, AMI, or hostname fails by name at synthesis, before any resource
is created.

Android SDK, emulator, system image, and bridge versions are **not pinned yet**,
because they are chosen in step 3 and 5 of the plan and must be recorded with
the image digest that actually ran. Nothing in this document should be read as
having chosen them.

### Why the instance is created from a raw CloudFormation template

Nested virtualization is only expressible through `CpuOptions`. In alchemy
2.0.0-beta.79 the `AWS/AutoScaling/LaunchTemplate` props are `assetPrefix`,
`associatePublicIpAddress`, `build`, `code`, `defaultVersionNumber`, `env`,
`handler`, `hash`, `imageId`, `instanceProfileName`, `instanceType`, `keyName`,
`latestVersionNumber`, `launchTemplateArn`, `launchTemplateId`,
`launchTemplateName`, `main`, `managedIam`, `output`, `policyName`,
`policyStatements`, `port`, `roleArn`, `roleManagedPolicyArns`, `roleName`,
`runtimeUnitName`, `securityGroupIds`, `tags`, `userData`: no `cpuOptions` and
no `launchTemplateData`. `AWS/CloudFormation/Stack` accepts `templateBody`, so
the template is the supported escape hatch rather than an invented property.

## How to run it

Prerequisites: AWS credentials available to alchemy for the target account (the
standard chain, so `aws configure` or `aws sso login` is enough), the region and
AMI for that region, and a hostname whose DNS zone is in the same Cloudflare
account as the stack. All of them go in `.env`; see `.env.example` for the
section and the exact command that resolves the AMI.

```bash
# .env
ANDROID_PREVIEW_REGION=eu-central-1
ANDROID_PREVIEW_AMI_ID=ami-...
ANDROID_PREVIEW_PROBE_HOSTNAME=android-probe.example.com

bunx alchemy deploy stacks/android-preview-probe.ts --stage probe --yes
```

Destroy it in the same session, and confirm deletion in the AWS API rather than
trusting the command's exit code:

```bash
bunx alchemy destroy stacks/android-preview-probe.ts --stage probe --yes
```

## Measurements

Fill each row with the command and its output. Numbers without a command are
not evidence.

| Measurement                    | Command                                                                                          | Result              |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------- |
| Effective CPU options          | `aws ec2 describe-instances --instance-ids <id> --query 'Reservations[].Instances[].CpuOptions'` |                     |
| Device node and permissions    | `ls -l /dev/kvm`                                                                                 |                     |
| Emulator acceleration          | `emulator -accel-check`                                                                          |                     |
| CPU virtualization flags       | `grep -m1 -oE 'vmx                                                                               | svm' /proc/cpuinfo` |     |
| Emulator boot to home          | emulator log timestamps                                                                          |                     |
| Input round trip, p95 of 20    | bridge/client instrumentation                                                                    |                     |
| Reconnect to running session   | client instrumentation                                                                           |                     |
| Screen traffic per review-hour | host interface counters                                                                          |                     |
| Concurrent hosts               | two sessions, one control each                                                                   |                     |
| Shutdown to `stopped`          | `aws ec2 describe-instances --query 'Reservations[].Instances[].State.Name'`                     |                     |
| Cost per running hour          | usage to the published rate card                                                                 |                     |

## Notes that outlived the host change

- The Cloudflare Containers investigation stopped at a `403` on the Containers
  API with no credential carrying Containers permission, so it never produced a
  KVM measurement. Two earlier claims were overstated and are corrected in
  `AGENTS.md`: a missing schema field is not a runtime measurement, and "no
  direct inbound UDP to a container" does not rule out every WebRTC topology.
- AWS documents M7i as supporting nested virtualization with KVM as the L1
  hypervisor and no additional charge, but the same page recommends evaluating
  bare metal for latency-sensitive workloads. Acceleration availability is
  therefore not the risk; streaming performance under nesting is.

## First Singapore run, 2026-09-20

Region `ap-southeast-1`, `m7i.xlarge`, AMI `ami-095f155a67469a548` (AL2023,
kernel 6.18, x86_64), 50 GiB encrypted gp3. Deployed through alchemy to stage
`probe`, measured over SSM, destroyed in the same session.

| Measurement                 | Command                                                              | Result                                                                |
| --------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Device node                 | `ls -l /dev/kvm`                                                     | `crw-rw-rw- 1 root kvm 10, 232`                                       |
| CPU virtualization flags    | `grep -m1 -oE 'vmx\|svm' /proc/cpuinfo`                              | `vmx`                                                                 |
| Hypervisor flag             | `grep -m1 -oE hypervisor /proc/cpuinfo`                              | present, expected inside a VM                                         |
| Size                        | `nproc`, `free -m`                                                   | 4 vCPU, 15705 MiB                                                     |
| Kernel                      | `uname -r`                                                           | 6.18.48-109.150.amzn2023.x86_64                                       |
| Instance CPU options        | `aws ec2 describe-instances ... --query '...CpuOptions'`             | `{CoreCount: 2, ThreadsPerCore: 2}`, no `NestedVirtualization` field  |
| Launch template CPU options | `aws ec2 describe-launch-template-versions --versions '$Latest' ...` | empty, although the template declares `NestedVirtualization: enabled` |
| Stack create                | alchemy deploy                                                       | 176 s                                                                 |
| Teardown                    | alchemy destroy, then API checks                                     | stack gone, instance `terminated`, no volumes left                    |

**The trap worth keeping:** the control plane disagreed with the guest. Both
`describe-launch-template-versions` (empty `CpuOptions`) and `describe-instances`
(no `NestedVirtualization` key) said the setting had not applied, while the host
had a working `/dev/kvm`, `vmx`, and 4 vCPUs. Anyone reading only the API would
have concluded the opposite of the truth here, and the same API-only check would
also fail to catch a host that genuinely lacks KVM. The acceptance signal is the
guest.

**Also learned the hard way:** a launch template without `SubnetId` places the
instance in the account's default VPC, and the launch fails with "security group
and subnet belong to different networks". The first Singapore deploy rolled back
on exactly that. The interface block is now asserted by a test.

Not measured in this run, and required before the acceleration gate is called
passed: the emulator itself (`emulator -accel-check`, boot to home screen). A
KVM device node is necessary and not sufficient, which this document said before
the run and still says after it.

## Emulator run, 2026-09-20 (second run)

Same host shape as the first run, this time through to a running emulator and a
real release APK.

| Measurement                  | Command                                                           | Result                                                         |
| ---------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| Emulator acceleration        | `emulator -accel-check`                                           | `KVM (version 12) is installed and usable.`                    |
| Boot to `sys.boot_completed` | emulator launch timestamp vs `getprop`                            | **41 seconds** (Android 14, x86_64, headless, swiftshader GPU) |
| Release APK                  | `expo prebuild --platform android` then `gradlew assembleRelease` | built, 121194158 bytes, package `dev.fawwaz.proof.preview`     |
| Install                      | `adb install -r`                                                  | `Success`                                                      |
| Metro dependency             | `ss -ltnp` on the host                                            | `NO_METRO_PORT`, and the app still launched                    |
| App stays running            | `adb shell pidof`                                                 | **no: crash on launch**                                        |

### The APK crashes without a fingerprint, and that is a required build step

```
java.io.FileNotFoundException: fingerprint
  at android.content.res.AssetManager.nativeOpenAsset
  at expo.modules.updates.UpdatesConfiguration$Companion.getRuntimeVersion
  at expo.modules.updates.UpdatesController.initialize
```

The app declares `runtimeVersion: { policy: "fingerprint" }`, so `expo-updates`
reads a `fingerprint` asset at startup. EAS Build generates that asset; a plain
`expo prebuild` plus `gradlew assembleRelease` does not, and the resulting APK
installs cleanly and then dies on first launch. The plan's "self-contained
preview APK" recipe must therefore include the fingerprint step explicitly (or
build with updates genuinely disabled), and pin it. This is a build-recipe gap,
not a host limitation: the emulator, the install, and the launch path all work.

### Two traps that cost time here

- **The emulator needs X11 libraries even with `-no-window`.** On a minimal
  Amazon Linux 2023 image it exited with
  `Could not open libX11-xcb.so.1, give up`. `-no-window` removes the window, not
  the Qt/X11 dependency. Installing `libX11`, `libX11-xcb`, `libxcb`,
  `libXcomposite`, `libXcursor`, `libXdamage`, `libXext`, `libXfixes`, `libXi`,
  `libXrender`, `libXtst`, `libXrandr`, `mesa-libGL`, `libglvnd`, and
  `pulseaudio-libs` fixed it.
- **`adb wait-for-device` never returns when the emulator has died**, so the
  command that was supposed to measure a boot hung until it was cancelled.
  Every wait in the probe is now bounded and checks that the emulator process
  still exists.

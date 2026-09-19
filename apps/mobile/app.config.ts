import type { ExpoConfig } from "expo/config";

/**
 * Identity derives from env, like every hostname in the stack
 * (apps/backend/config/domain.ts): APP_NAME is what people read, APP_SLUG the
 * machine form (and the base of the deep-link schemes), ROOT_DOMAIN the zone.
 *
 * Two variants share one Expo project:
 * - `preview` (the default, and what every worktree and PR build uses): the
 *   installed development client, with a distinct identifier (`<base>.preview`)
 *   and scheme (`<slug>-preview`) so it can sit beside the production app.
 * - `production`: the stable identity, selected by the production build profile.
 *
 * APP_VARIANT selects the variant. It is native configuration on purpose: it is
 * part of the fingerprint, so a preview build can never load a production
 * update or the other way around.
 *
 * Blank env values are treated as absent. `process.env.APP_SLUG ?? "app"` is not
 * enough: a blank writes an empty string, nullish coalescing keeps it, and the
 * app ends up with an empty scheme and a `dev.proof.` bundle identifier.
 */
const read = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

/**
 * What a *distributed* build requires of this clone's identity, as sentences
 * `bun run mobile:doctor` prints verbatim. Empty means usable.
 *
 * This function is the single authority: the app config throws on a non-empty
 * list during an EAS build, and the doctor reports the same list without
 * building. A drifted second copy is how a doctor once declared a machine ready
 * while the build it promised would have failed.
 */
export const distributableIdentityProblems = (env: Record<string, string | undefined>): string[] => {
  const value = (key: string): string | undefined => {
    const raw = env[key]?.trim();
    return raw ? raw : undefined;
  };
  const problems: string[] = [];
  if (value("APP_SLUG") === undefined)
    problems.push(
      "APP_SLUG is unset: the `app` fallback collides across clones, and the bundle identifier, scheme, and Expo project slug all derive from it. Set it in the repository .env and run `bun run mobile:env`.",
    );
  if (value("EAS_PROJECT_ID") === undefined && value("EAS_BUILD_PROJECT_ID") === undefined)
    problems.push(
      "EAS_PROJECT_ID is unset: nothing can be built, looked up, or published for this app. Create or reuse the project (`bunx eas init` in apps/mobile) and put its id in apps/mobile/.env.",
    );
  return problems;
};

const variant = read("APP_VARIANT") === "production" ? ("production" as const) : ("preview" as const);
const explicitSlug = read("APP_SLUG");
const appSlug = explicitSlug ?? "app";
const baseName = read("APP_NAME") ?? "Proof";
const rootDomain = read("ROOT_DOMAIN");
// Our own variable in GitHub Actions; EAS's built-in during cloud builds
// (EAS_BUILD_* values exist at config-resolution time, project env vars of
// secret visibility do not).
const projectId = read("EAS_PROJECT_ID") ?? read("EAS_BUILD_PROJECT_ID");

// A distributable artifact must carry a real identity: the fallback slug would
// make identifiers collide across clones, and unlike a local run it outlives
// the machine that produced it. The doctor checks the same rule, so a machine
// it calls ready cannot fail here.
if (read("EAS_BUILD") === "true") {
  const problems = distributableIdentityProblems(process.env);
  if (problems.length > 0) throw new Error(`Cannot build a distributable app:\n- ${problems.join("\n- ")}`);
}

const baseIdentifier = rootDomain ? [...rootDomain.split(".").reverse(), appSlug].join(".") : `dev.proof.${appSlug}`;
const bundleIdentifier = variant === "production" ? baseIdentifier : `${baseIdentifier}.preview`;

const config: ExpoConfig = {
  name: variant === "production" ? baseName : `${baseName} Preview`,
  slug: appSlug,
  scheme: variant === "production" ? appSlug : `${appSlug}-preview`,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier,
    supportsTablet: false,
    // Declared before the first build on purpose: the build service otherwise
    // asks the encryption question once and writes the answer into the project,
    // which changes the native fingerprint and silently invalidates every
    // update published against the earlier build.
    config: { usesNonExemptEncryption: false },
  },
  // Android is optional configuration for adopters, not a verified target: the
  // same identifier scheme keeps a preview APK installable beside production.
  android: {
    package: bundleIdentifier,
  },
  plugins: [
    "expo-router",
    [
      "expo-build-properties",
      {
        ios: {
          // SDK 57 opt-in for the iOS 27 SDK's scene life cycle: without it, an
          // app built with Xcode 27 does not launch on iOS 27. Drop this once
          // SDK 58 lands, where scene support is the default.
          enableSceneSupport: true,
        },
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#fafafa",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
    "expo-secure-store",
    [
      "expo-image-picker",
      {
        photosPermission: "Only pick an image to attach to a note.",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  ...(projectId
    ? {
        // EAS CLI resolves the project from here. Without it, every
        // EXPO_TOKEN-driven command in CI fails with "EAS project not
        // configured", even when updates.url is set.
        extra: { eas: { projectId } },
        updates: { url: `https://u.expo.dev/${projectId}` },
        runtimeVersion: { policy: "fingerprint" as const },
      }
    : {}),
};

export default config;

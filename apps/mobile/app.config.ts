import type { ExpoConfig } from "expo/config";

/**
 * Identity derives from env, like every hostname in the stack
 * (apps/backend/config/domain.ts): APP_NAME is what people read, APP_SLUG
 * the machine form (and the deep-link scheme), ROOT_DOMAIN the zone.
 *
 * The bundle identifier is the one value that must be globally unique in
 * Apple's registry and stable for the life of the app: reversed domain plus
 * slug (ROOT_DOMAIN=fawwaz.dev + APP_SLUG=proof -> dev.fawwaz.proof).
 * Day zero without a domain falls back to dev.proof.<slug>; pick a real
 * identifier before the first device build.
 *
 * EAS_PROJECT_ID arrives with the one-time EAS ceremony (documented
 * alongside the preview pipeline in AGENTS.md). When set, the config links
 * the EAS project, embeds the update URL, and pins the fingerprint runtime
 * version policy, which is what makes per-PR OTA updates possible; without
 * it the app is a plain local build.
 */
const appName = process.env.APP_NAME ?? "Proof";
const appSlug = process.env.APP_SLUG ?? "app";
const rootDomain = process.env.ROOT_DOMAIN;
// Our own variable in GitHub Actions; EAS's built-in during cloud builds
// (EAS_BUILD_* values exist at config-resolution time, project env vars of
// secret visibility do not).
const projectId = process.env.EAS_PROJECT_ID ?? process.env.EAS_BUILD_PROJECT_ID;

const bundleIdentifier = rootDomain ? [...rootDomain.split(".").reverse(), appSlug].join(".") : `dev.proof.${appSlug}`;

const config: ExpoConfig = {
  name: appName,
  slug: appSlug,
  scheme: appSlug,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier,
    supportsTablet: false,
    // Declared before the first build on purpose: the build service
    // otherwise asks the encryption question once and writes the answer
    // into the project, which changes the native fingerprint and silently
    // invalidates every update published against the earlier build.
    config: { usesNonExemptEncryption: false },
  },
  plugins: [
    "expo-router",
    [
      "expo-build-properties",
      {
        ios: {
          // SDK 57 opt-in for the iOS 27 SDK's scene life cycle: without it,
          // an app built with Xcode 27 does not launch on iOS 27. Drop this
          // once SDK 58 lands, where scene support is the default.
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

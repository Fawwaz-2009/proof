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
 * EAS_PROJECT_ID arrives with the one-time EAS ceremony (see AGENTS.md).
 * When set, the build embeds the update URL and the fingerprint runtime
 * version policy, which is what makes per-PR OTA updates possible; without
 * it the app is a plain local build.
 */
const appName = process.env.APP_NAME ?? "Proof";
const appSlug = process.env.APP_SLUG ?? "app";
const rootDomain = process.env.ROOT_DOMAIN;
const projectId = process.env.EAS_PROJECT_ID;

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
    icon: "./assets/expo.icon",
    bundleIdentifier,
    supportsTablet: false,
  },
  plugins: [
    "expo-router",
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
        updates: { url: `https://u.expo.dev/${projectId}` },
        runtimeVersion: { policy: "fingerprint" as const },
      }
    : {}),
};

export default config;

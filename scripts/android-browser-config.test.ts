import { expect, test } from "bun:test";

test("browser APK ignores an ambient EAS project and bundles without OTA", () => {
  const child = Bun.spawnSync(["bun", "-e", 'import config from "./apps/mobile/app.config.ts"; console.log(JSON.stringify(config));'], {
    env: { ...process.env, MOBILE_DELIVERY: "browser-apk", APP_VARIANT: "preview", APP_SLUG: "example", EAS_PROJECT_ID: "ambient-project" },
  });
  expect(child.exitCode).toBe(0);
  const config = JSON.parse(child.stdout.toString());
  expect(config.updates).toEqual({ enabled: false });
  expect(config.runtimeVersion).toBeUndefined();
  expect(config.extra?.eas).toBeUndefined();
  expect(config.android.package).toEndWith(".example.preview");
});

test("device delivery retains its fingerprint and project configuration", () => {
  const child = Bun.spawnSync(["bun", "-e", 'import config from "./apps/mobile/app.config.ts"; console.log(JSON.stringify(config));'], {
    env: { ...process.env, MOBILE_DELIVERY: "device", APP_VARIANT: "preview", APP_SLUG: "example", EAS_PROJECT_ID: "device-project" },
  });
  expect(child.exitCode).toBe(0);
  const config = JSON.parse(child.stdout.toString());
  expect(config.runtimeVersion).toEqual({ policy: "fingerprint" });
  expect(config.updates.url).toBe("https://u.expo.dev/device-project");
});

import Constants from "expo-constants";

/**
 * The stage's public URL, baked into the bundle at build/update time:
 * `bun run dev` prints the local website URL, CI bakes the pr-N stage URL,
 * a production build bakes the prod URL. Metro inlines EXPO_PUBLIC_* on
 * direct property access, which is why the literal is read here and nowhere
 * else. Empty means the app was built without a stage; index.tsx renders
 * the setup note instead of a broken sign-in.
 */
export const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";

/** The deep-link scheme, from app.config.ts (which derives it from APP_SLUG). */
const scheme = Constants.expoConfig?.scheme;
export const appScheme = Array.isArray(scheme) ? (scheme[0] ?? "app") : (scheme ?? "app");

/**
 * Resolve a view-provided URL against the baked stage. Views hand out
 * origin-relative paths in dev (the gateway lives on the same host as the
 * web app) and absolute presigned URLs on deployed stages; native has no
 * same-origin concept, so relative paths resolve here.
 */
export const resolveApiUrl = (url: string | null): string | undefined => (url ? (url.startsWith("/") ? `${apiUrl}${url}` : url) : undefined);

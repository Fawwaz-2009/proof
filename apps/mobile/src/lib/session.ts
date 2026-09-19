/**
 * Session scoping for one installed preview app that opens several PR backends.
 *
 * Persisted auth state (better-auth's cookie and its cached session) must never
 * be shared between backends: opening PR 22 with PR 21's cookie would replay
 * another review's account and data. The expo plugin's `storagePrefix` is the
 * only storage knob, so it carries a deterministic namespace derived from the
 * normalized backend origin.
 */

/** URL-parsed origin: lowercased, non-default port preserved, path and trailing slashes dropped. */
export const normalizeOrigin = (url: string): string => {
  try {
    return new URL(url).origin.toLowerCase();
  } catch {
    return url.trim().replace(/\/+$/, "").toLowerCase();
  }
};

/**
 * Short, stable, SecureStore-safe namespace (FNV-1a, base36). Letters and
 * digits only, which is the key alphabet expo-secure-store accepts; hashing
 * avoids embedding dots, dashes, and host names into key material.
 */
export const originNamespace = (url: string): string => {
  const origin = normalizeOrigin(url);
  let hash = 2166136261;
  for (let index = 0; index < origin.length; index++) {
    hash ^= origin.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

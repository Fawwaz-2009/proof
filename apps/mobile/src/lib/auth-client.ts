import { expoClient } from "@better-auth/expo/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { apiUrl, appScheme } from "./env";
import { originNamespace } from "./session";

/**
 * The better-auth client for the native app. The expo plugin keeps the session
 * cookie in SecureStore and replays it via `getCookie()` (used by
 * lib/api-client.ts); `emailOTPClient` types the same passwordless endpoints
 * the web sign-in uses. The server trusts the app's scheme in trustedOrigins
 * (apps/backend/config/auth.ts), stage by stage.
 *
 * The storage prefix carries the backend origin's namespace: one installed
 * preview app opens several PR backends, and a shared prefix would let PR 22
 * read PR 21's cookie and cached session.
 */
export const authClient = createAuthClient({
  baseURL: apiUrl,
  plugins: [
    emailOTPClient(),
    expoClient({
      scheme: appScheme,
      storagePrefix: `${appScheme}-${originNamespace(apiUrl)}`,
      storage: SecureStore,
    }),
  ],
});

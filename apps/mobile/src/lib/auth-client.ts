import { expoClient } from "@better-auth/expo/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { apiUrl, appScheme } from "./env";

/**
 * The better-auth client for the native app. The expo plugin keeps the
 * session cookie in SecureStore and replays it via `getCookie()` (used by
 * lib/api-client.ts); `emailOTPClient` types the same passwordless
 * endpoints the web sign-in uses. The server trusts the scheme in
 * trustedOrigins (apps/backend/config/auth.ts).
 */
export const authClient = createAuthClient({
  baseURL: apiUrl,
  plugins: [
    emailOTPClient(),
    expoClient({
      scheme: appScheme,
      storagePrefix: appScheme,
      storage: SecureStore,
    }),
  ],
});

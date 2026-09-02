import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { HttpApiClient } from "effect/unstable/httpapi";
import { DevelopmentApi } from "@sufra/backend/contract";

/** Reads the development OTP mailbox (non-prod hosts only); the login page autofills from it. */
export const getDevMailbox = (email: string, baseUrl = globalThis.location.origin) =>
  HttpApiClient.make(DevelopmentApi, { baseUrl }).pipe(
    Effect.flatMap((client) => client.devMailbox.getDevMailbox({ query: { email } })),
    Effect.provide(FetchHttpClient.layer),
    Effect.runPromise,
  );

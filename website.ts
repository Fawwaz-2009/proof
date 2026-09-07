// The FRONTEND deploy unit — TanStack Start (apps/web) built by
// `Cloudflare.Website.Vite`, the stack's SOLE public ingress. The backend is
// `workersDev: false`; the web Worker forwards /api to it over the `BACKEND`
// service binding (apps/web/src/routes/api.$.ts).
//
// This file lives at the workspace ROOT, deliberately OUTSIDE apps/web:
// `Website.Vite` content-hashes every non-gitignored file under `rootDir` to
// decide rebuilds — an IaC file inside apps/web would rebuild + redeploy the
// frontend on every deploy-shape edit. The backend's declaration lives in its
// app because worker.ts IS the Worker's runtime module; the Vite site has no
// such file, so the root — where the IaC toolchain already lives
// (alchemy.run.ts, tsconfig.iac.json) — is the honest home.

import * as Cloudflare from "alchemy/Cloudflare";
import { ALCHEMY_DEV } from "alchemy/Phase";
import * as Effect from "effect/Effect";
import { Path } from "effect/Path";
import Backend from "./apps/backend/src/worker.ts";
import { devPort } from "./apps/backend/config/domain.ts";
import { websiteDomain } from "./apps/backend/config/domain.ts";

const websiteDeployProps = Effect.gen(function* () {
  const path = yield* Path;
  const webPort = yield* devPort("web-");
  const websiteUrl = yield* websiteDomain;
  const isDev = yield* Effect.orDie(ALCHEMY_DEV);
  // Yielding the SAME Worker entry the stack deploys registers/dedupes it by
  // logical id — this is what makes the BACKEND service binding point at the
  // stage's own backend Worker.
  const backend = yield* Backend;
  return {
    rootDir: path.resolve(import.meta.dirname, "apps/web"),
    compatibility: {
      date: "2026-07-11",
      // nodejs_compat: React SSR + the effect/unstable/http client on the SSR
      // data path; enable_request_signal: TanStack Start's loader signals.
      flags: ["nodejs_compat", "enable_request_signal"],
    },
    observability: {
      enabled: true,
      headSamplingRate: 0.1,
      logs: { enabled: true, invocationLogs: true, headSamplingRate: 0.1 },
      traces: { enabled: true, headSamplingRate: 0.01 },
    },
    memo: {
      // The site imports @starting-flare/backend/contract (a sibling workspace
      // package); the default hash scope only covers apps/web, so the shared
      // contract sources are added explicitly and the lockfile stays in the
      // hash (providing `include` drops it otherwise).
      include: ["**/*", "../backend/src/contracts/**", "../backend/src/views/**"],
      lockfile: true,
    },
    // The stage's deterministic dev port: parallel `alchemy dev` sessions
    // isolate by STAGE, and strictPort fails loudly on a taken port.
    // Deployed: the stage's Custom Domain (DNS + certificate auto-managed);
    // workers.dev stays off so the custom host is the one canonical URL.
    // Local: the deterministic dev server port instead, no DNS touched.
    ...(isDev
      ? { dev: { port: webPort, strictPort: true } }
      : { domain: websiteUrl, workersDev: false }),
    env: {
      // The private backend this Worker proxies to — the only binding the
      // frontend has.
      BACKEND: backend,
    },
  };
});

export class Website extends Cloudflare.Website.Vite<Website>()("Website", websiteDeployProps) {}

export type WebsiteEnv = Cloudflare.InferEnv<typeof Website>;

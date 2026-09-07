// starting-flare infrastructure as code: Alchemy v2, Effect-native. ONE stack at the
// workspace root: one plan, one state file, deploying BOTH apps — the private
// Backend Worker (apps/backend, no public URL, owns D1/R2/Email + auth) and
// the public Website.Vite frontend (apps/web, the sole ingress, forwarding
// /api over the BACKEND service binding).
//   alchemy deploy --stage prod     # production
//   alchemy deploy --stage pr-123   # an isolated throwaway stage (clean destroy)
//   alchemy dev                     # both Workers locally; zero .env required
//
// Composition-root discipline: this file names the stack, merges providers,
// picks state, and yields the units — NOTHING else. The backend's deploy
// shape lives with the backend (apps/backend/src/worker.ts + infra slices);
// the frontend's lives in ./website.ts, outside apps/web on purpose (see its
// header).

import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import Backend from "./apps/backend/src/worker.ts";
import { d1Database } from "./apps/backend/config/database/index.ts";
import { FilesBucket } from "./apps/backend/config/storage.ts";
import { Website } from "./website.ts";

export default Alchemy.Stack(
  "StartingFlare",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Drizzle.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const database = yield* d1Database;
    const bucket = yield* FilesBucket;
    const backend = yield* Backend;
    const website = yield* Website;
    return {
      url: website.url,
      backendWorkerName: backend.workerName,
      databaseId: database.databaseId,
      bucketName: bucket.bucketName,
    };
  }),
);

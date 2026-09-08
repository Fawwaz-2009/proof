// proof infrastructure as code: Alchemy v2, Effect-native. ONE stack at the
// workspace root: one plan, one state file, deploying BOTH apps — the private
// Backend Worker (apps/backend, no public URL, owns D1/R2/Email + auth) and
// the public Website.Vite frontend (apps/web, the sole ingress, forwarding
// /api over the BACKEND service binding).
//   alchemy deploy --stage prod     # production
//   alchemy deploy --stage pr-123   # an isolated throwaway stage (clean destroy)
//   alchemy dev                     # both Workers locally; zero .env required
//
// Composition-root discipline: this file names the stack, merges providers,
// picks state, and yields the units. One CI-only extra: in GitHub Actions
// preview deploys it declares the PR comment resource (local runs skip it).
// The backend's deploy
// shape lives with the backend (apps/backend/src/worker.ts + infra slices);
// the frontend's lives in ./website.ts, outside apps/web on purpose (see its
// header).

import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle";
import * as GitHub from "alchemy/GitHub";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import Backend from "./apps/backend/src/worker.ts";
import { d1Database } from "./apps/backend/config/database/index.ts";
import { FilesBucket } from "./apps/backend/config/storage.ts";
import { Website } from "./website.ts";

// The stack name is the infrastructure's state scope: the address under
// which alchemy remembers every resource it made. Renaming this string
// orphans the existing D1, R2, and workers under an empty scope: the
// next deploy provisions fresh ones beside them. It is set once (at
// scaffold time for scaffolded apps, at origin for this repository) and
// never edited after the first deploy. See docs/faq.md.
export default Alchemy.Stack(
  "StartingFlare",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Drizzle.providers(), GitHub.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const database = yield* d1Database;
    const bucket = yield* FilesBucket;
    const backend = yield* Backend;
    const website = yield* Website;
    // CI preview deploys announce their stage URL on the PR. The comment is
    // a state-tracked resource: the constant logical id updates the same
    // comment on every push, and its body reads the Website resource's real
    // url output, so it can never drift from the deployed hostname. Local
    // runs have no PULL_REQUEST and skip the block entirely.
    if (process.env.PULL_REQUEST) {
      const [owner = "", repository = ""] = (process.env.GITHUB_REPOSITORY ?? "").split("/");
      yield* GitHub.Comment("preview-comment", {
        owner,
        repository,
        issueNumber: Number(process.env.PULL_REQUEST),
        body: Output.interpolate`
          ⚡ **Preview:** ${website.url} · stage \`${process.env.STAGE ?? `pr-${process.env.PULL_REQUEST}`}\` · \`${(process.env.GITHUB_SHA ?? "").slice(0, 7)}\`

          _This comment updates automatically with each push._
        `,
      });
    }
    return {
      url: website.url,
      backendWorkerName: backend.workerName,
      databaseId: database.databaseId,
      bucketName: bucket.bucketName,
    };
  }),
);

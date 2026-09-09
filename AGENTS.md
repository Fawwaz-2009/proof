# proof

proof is an Effect-native starting template on alchemy v2: one stack,
two workers, a private backend (D1, R2, better-auth) and a public TanStack Start
website that proxies
`/api/*` to the backend over a service binding. The backend is the reference
implementation of the app's architecture; copy its patterns, don't invent
new ones. Concept questions (what a proof is, why hashed ports, the view
concept) live in `docs/faq.md`.

## The loop: every issue ends in a PR

An issue is done when a pull request exists, never when you say "done":

1. Work in a worktree (`bun scripts/wt.ts <name>`), never on a shared
   checkout.
2. Open the PR against `main` when the change is complete and the
   verification gate passes (`bun run check`).
3. The PR description is the **proof brief**. Use this shape:

   ```markdown
   ## What changed

   <the change, mapped to the issue's acceptance criteria>

   ## What fought back

   <errors hit, judgement calls, anything a diff cannot show>

   ## How to check the proof

   <exact steps on the preview URL: route, input, expected result>
   ```

The reviewer tests the running preview and comments; they do not review
the diff first. Merging ships production.

## Commands

    alchemy dev                  # both workers locally (backend 23454, website 22343)
    alchemy deploy --stage X     # provision + deploy a stage
    cd apps/backend && tsc       # backend typecheck
    cd apps/web && tsc           # web typecheck

## The two phases

Alchemy workers run in two phases, and the type system enforces the split:

- **Init** (`Effect.gen` inside `Cloudflare.Worker<...>()`): runs at deploy and
  at cold start. May require only `Tag | PlatformServices | WorkerServices`.
  May NOT require `RuntimeContext` — there is no request during init.
- **Runtime** (`fetch` in the returned shape): per request. May require
  `RuntimeContext | Scope | HttpServerRequest` — alchemy serves the real
  context per request.

Everything the routes need must be provided INTO the router before
`HttpRouter.toHttpEffect` (the discharge edge). Consumers come before
providers in the pipe: each `Layer.provide` discharges requirements already
accumulated, so a later layer can never satisfy an earlier one.

### Why domain code yields everything

The yield chain IS the provisioning chain. A resource (the D1 binding, the
R2 bucket) only exists during init: that is where `worker.ts` reads
`Config`, yields `FilesBucket`, and builds the services that wrap those
resources. A domain function never imports a resource or calls a service
directly, it declares what it needs with `yield*` (`AppDatabase`, `Files`,
`CurrentUser`) and lets the requirement flow upward:

    domain/notes.ts      yield* AppDatabase   (requirement declared)
    worker.ts init gen   AppDatabase built from the D1 binding, provided
    fetch handler        closes over the BUILT service; per request only
                         request-scoped requirements remain (CurrentUser)

Follow `Notes` for the canonical trace: `makeNotes` yields `AppDatabase`,
`Files`, and `makeBuildNoteView` when it is CONSTRUCTED (init), so its
methods carry only `CurrentUser` at runtime. Three rules follow:

1. Never import a resource outside `config/`; resources are init-phase
   values, and reaching for one from domain or controller code bypasses
   the provision chain and dies at the discharge edge (type error).
2. Never call a service function directly; yield the service. The yield
   is what makes the init phase build and provide it.
3. If the type system says a requirement is missing at the discharge
   edge, the fix is always a `Layer.provide` upstream, never a cast.

## The layers

| Layer           | Location           | Job                                                         |
| --------------- | ------------------ | ----------------------------------------------------------- |
| Contract        | `src/contracts/`   | endpoints, schemas, limits, middleware declaration          |
| Controller      | `src/controllers/` | yields services, adapts payloads to domain inputs           |
| Domain          | `src/domain/`      | business rules as an Effect service; yields config services |
| View            | `src/views/`       | `buildXxxView` factories: domain row → wire shape with URLs |
| Config services | `config/`          | infra resources wrapped as services (see below)             |

Dependency direction: controller → domain → config services. Resources appear
only inside `config/`; nothing above depends on alchemy types.

## The service idiom

Every infra/resource wrapper and domain module uses the same idiom:

    export class X extends Context.Service<X>()("AppApi/X", {
      make: Effect.gen(function* () {
        const dep = yield* SomeDependency;   // resolved once at build
        return { /* methods; effects require only request-scoped things */ };
      }),
    }) {
      static readonly Live = Layer.effect(X, this.make).pipe(
        Layer.provide(<the layers that serve this service's requirements>),
      );
    }

Rules:

- `make` resolves build-time dependencies once per isolate; method results
  carry only request-scoped requirements (e.g. `CurrentUser`).
- Requirements between services are discharged at the worker's discharge
  edge, consumers before providers.
- The worker's own gens stay inline (matching the shape
  `Cloudflare.Worker<Backend>()("Backend", Effect.gen(...), Effect.gen(...))`).

## Dependency management (Effect conventions)

Dependencies enter services and builders through the Effect context only:
`yield* SomeTag`. The R channel documents the requirement and Effect infers
every type. Passing a service, or a resolved service handle, as a function
argument is a huge red flag: it is the factory shape the service idiom
replaces, and it immediately forces hand-written type annotations (for
example `type FilesService = Effect.Success<typeof Files>`) where yielding
the tag infers everything. If a hand-written annotation exists to type a
parameter, the parameter is the bug.

When a builder needs a service, the builder is itself an Effect that yields
the service and returns the built value:

    export const devFilesRoutes = Effect.gen(function* () {
      const files = yield* Files;
      return HttpRouter.addAll([/* handlers close over files */]);
    });

Callers resolve it where the requirement is already discharged (worker
init / the discharge edge):
`yield* Effect.provide(devFilesRoutes, Files.Live)`.

## Validation placement

- The contract schema declares shape and the declared limits (for multipart:
  `HttpApiSchema.asMultipart({ maxFileSize, maxTotalSize })` — the parser
  enforces them mid-stream and rejects before the domain runs).
- The domain enforces reality: actual byte size, ownership, business rules.
  Ownership checks are uniform 404s ("does not exist apart from its owner").
- Views never contain storage keys or infra types; they expose URLs.

## Images / uploads (multipart through the app)

`POST /api/notes` is a multipart endpoint (`HttpApiSchema.asMultipart`): the
contract schema enforces content-type whitelist and per-file/request size
limits (makeFilter + parser limits, rejected before the domain runs), the
controller reads the persisted file part via the in-memory filesystem
(`config/memory-fs.ts`), the domain puts bytes to R2 and writes the row, and
the view exposes `imageUrl` from `Files.signReadUrl` (aws4fetch): a
presigned R2 GET URL (15-min TTL) on deployed stages, the localhost gateway
path in dev. The browser loads images directly; no presigned PUT, no
base64, no bytes in JSON.

Credential + memory rules:

- R2 S3 credentials are the key pair `R2_ACCESS_KEY_ID` +
  `R2_SECRET_ACCESS_KEY` (Object Read scoped to the bucket); the account id
  is not user-provided — worker.ts derives it from the authenticated
  account (CloudflareEnvironment) and binds it as `R2_ACCOUNT_ID`. They are
  required: absent values fail loudly rather than serving broken image
  URLs.
- Local dev serves images through the gateway route
  (`GET /api/dev/files/*`, `config/dev-files.ts`), mounted only under
  `ALCHEMY_DEV`, which `alchemy dev` injects into the worker isolate: the
  simulator bucket does not exist in real R2, so presigned URLs would 404.
  The gateway streams objects from the binding, unauthenticated by design
  (localhost only, unguessable keys). Do NOT bind `ALCHEMY_DEV` into the
  worker props env: that name collides with alchemy's own env handling and
  every request 500s; read the ambient value instead.
- `config/memory-fs.ts` holds in-flight upload bytes in the isolate (128MB
  shared across concurrent requests). `maxFileSize` bounds a single request;
  keep concurrent in-flight uploads x maxFileSize well under 128MB. Verified
  by `apps/backend/test/memory-fs.test.ts` (bun test): 16 concurrent 1MB
  uploads per wave, zero residue across waves.
- For large files, switch the endpoint payload to
  `HttpApiSchema.asMultipartStream` (constant memory, manual part handling) —
  the frontend contract does not change.
- Schema decode failures surface as a typed 400 `ValidationError` with the
  checker's message via `SchemaErrorHandlerLive`
  (`HttpApiMiddleware.layerSchemaErrorTransform`). Oversize uploads render a
  built-in 413 (defect-rendered; not transformable).

## Auth

better-auth instance is built once (`Auth.Live`) and mounted as a raw
catch-all at `/api/auth/*`. The contract middleware declares
`requires: RuntimeContext` (session resolution consults the ambient context
per call), which is why `worker.ts` has
`Layer.provide(Alchemy.RuntimeContext.phantom)` at the discharge edge:
satisfied at build, served for real per request. `CurrentUser` is provided
per request by the middleware; views never require it directly.

Email recipients are NEVER fake. NEVER trigger an email send (or an auth
flow that sends) against a live transport with a placeholder recipient
(`test.local`, `example.com`, invented inboxes): bounces from fake
recipients permanently damage the sending domain's reputation. Local and
preview stages capture to logs and never send; only the `prod` stage
delivers. When testing anything that can really send, use a real, verified
inbox supplied at test time (env or secret), never an address committed to
the source tree.

## Migrations

`Drizzle.Schema` runs drizzle-kit generate inside the deploy: schema module
(`config/database/schema.ts`) is diffed against the latest committed
snapshot, and the D1 resource applies pending SQL per database
(`__alchemy_migrations` bookkeeping). Migration files under
`apps/backend/migrations/` are committed source: generate locally, commit,
every environment replays its own delta. Never hand-edit snapshots.

## Worktrees (parallel agents and developers)

One command sets up an isolated worktree:

    bun scripts/wt.ts <name>          # ../<repo>-wt/<name>, branch <name>
    bun scripts/wt.ts --list          # existing worktrees
    bun scripts/wt.ts --remove <name> # remove worktree + branch

It copies `.env` from the main checkout (untracked files do not follow
branches), runs `bun install`, and prints the exact commands. Inside a
worktree:

- Run `bun run dev --stage dev-<name>`: that stage's own D1, R2 bucket, and
  deterministic port. NEVER a bare `bun run dev` in a worktree: the default
  stage is shared across worktrees and the sessions would collide.
- If the root `.env` changed after the worktree was created, re-copy it.
- Commit and open PRs from the worktree as usual (same repository). Every
  PR gets its own isolated `pr-N` preview stage with the URL posted on the
  PR; closing the PR destroys the stage.

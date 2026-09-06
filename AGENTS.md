# Sufra

Effect-native full-stack app on alchemy v2: one stack, two workers — a private
backend (D1, R2, better-auth) and a public TanStack Start website that proxies
`/api/*` to the backend over a service binding. The backend is the reference
implementation of the app's architecture; copy its patterns, don't invent new
ones.

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

## The layers

| Layer | Location | Job |
|---|---|---|
| Contract | `src/contracts/` | endpoints, schemas, limits, middleware declaration |
| Controller | `src/controllers/` | yields services, adapts payloads to domain inputs |
| Domain | `src/domain/` | business rules as an Effect service; yields config services |
| View | `src/views/` | `buildXxxView` factories: domain row → wire shape with URLs |
| Config services | `config/` | infra resources wrapped as services (see below) |

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
the view exposes `imageUrl` — a presigned R2 GET URL (15-min TTL) built by
`Files.signReadUrl` (aws4fetch). The browser loads images directly from R2;
no presigned PUT, no base64, no bytes in JSON.

Credential + memory rules:
- R2 S3 credentials come from env (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, Object Read scoped to the bucket). Without them the
  service degrades gracefully: `signReadUrl` yields null and notes render
  without images.
- Known limitation: presigned URLs point at the real R2 S3 endpoint, but in
  `alchemy dev` the Files bucket is a local simulator whose objects do not
  exist in real R2 — so dev-rendered image URLs 404 even with credentials
  set. Mature fix (see Fizzy's storage.oss.yml): run a local S3-compatible
  endpoint (MinIO) for dev and point the signer at it, or fall back to the
  authorized route URL in dev.
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

## Migrations

`Drizzle.Schema` runs drizzle-kit generate inside the deploy: schema module
(`config/database/schema.ts`) is diffed against the latest committed
snapshot, and the D1 resource applies pending SQL per database
(`__alchemy_migrations` bookkeeping). Migration files under
`apps/backend/migrations/` are committed source: generate locally, commit,
every environment replays its own delta. Never hand-edit snapshots.

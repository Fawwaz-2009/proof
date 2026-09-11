import { AwsClient } from "aws4fetch";
import * as Cloudflare from "alchemy/Cloudflare";
import { ALCHEMY_DEV } from "alchemy/Phase";
import * as Config from "effect/Config";
import { Context, Effect, Layer, Redacted } from "effect";

/** Attachment objects for the notes demo. Private: every read is authorized by the note's owner. */
export const FilesBucket = Cloudflare.R2.Bucket("Files");

export class Files extends Context.Service<Files>()("Files", {
  make: Effect.gen(function* () {
    const client = yield* Cloudflare.R2.ReadWriteBucket(FilesBucket);

    /**
     * Presigned GET URL for an object, ready for `<img src>` / direct
     * browser access. Pure SigV4 computation: no network call.
     *
     * The R2 S3 credentials are resolved in the init phase per the
     * secrets-env pattern: read from the deploy environment here, bound to
     * the Worker, and resolved from that binding at runtime. If the values
     * are absent from the deploy environment, the deploy fails loudly
     * rather than serving broken image URLs.
     */
    // Secrets resolve in the init phase per the secrets-env pattern: read
    // from the deploy environment (.env / shell), bound to the Worker as
    // secret_text, resolved from that binding at runtime.
    // Empty defaults keep the local dev loop zero-config: capture mode and
    // the dev gateway never sign, so the placeholder creds are never used.
    // Deploys gate on the real values in worker.ts (requireEnv).
    // These minted credentials exist only for this signer: object reads
    // and writes go through the bucket binding above. Upstream alchemy
    // plans presignUrl on the bucket binding, which would drop them
    // entirely; revisit when bumping alchemy.
    const accountId = yield* Config.string("R2_ACCOUNT_ID").pipe(Config.withDefault(""));
    const accessKeyId = yield* Config.string("R2_ACCESS_KEY_ID").pipe(Config.withDefault(""));
    const secretAccessKey = yield* Config.redacted("R2_SECRET_ACCESS_KEY").pipe(Config.withDefault(Redacted.make("")));
    const r2 = new AwsClient({
      accessKeyId,
      secretAccessKey: Redacted.value(secretAccessKey),
    });

    const signReadUrl = (key: string, expiresIn = 900) =>
      Effect.gen(function* () {
        // Locally the object lives in the dev simulator, not real R2, so a
        // presigned URL for the real host would 404. Dev views point at the
        // localhost gateway route instead (see config/dev-files.ts). This
        // branch needs no credentials at all: the dev gateway serves the
        // object through the bucket binding.
        const isDev = yield* ALCHEMY_DEV;
        if (isDev) return `/api/dev/files/${key}`;
        // Empty credentials mean presigning is unavailable: the note
        // renders without its image rather than with a URL that cannot
        // possibly work. CI always receives minted credentials.
        if (!accountId || !accessKeyId || Redacted.value(secretAccessKey) === "") return null;
        // The bucket name is a deploy-time output of the FilesBucket
        // resource: bound via props env, readable from the worker env at
        // request time (alchemy wires the env ConfigProvider per request).
        const bucketName = yield* Config.string("R2_BUCKET_NAME");
        const url = new URL(`https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`);
        url.searchParams.set("X-Amz-Expires", String(expiresIn));
        const signed = yield* Effect.promise(() => r2.sign(url, { aws: { signQuery: true } }));
        return signed.url;
      }).pipe(Effect.orDie);

    return {
      ...client,
      signReadUrl,
    };
  }),
}) {
  static readonly Live = Layer.effect(this, this.make).pipe(Layer.provide(Cloudflare.R2.ReadWriteBucketBinding));
}

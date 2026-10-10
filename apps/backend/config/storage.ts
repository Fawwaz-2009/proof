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
    const isDev = yield* Effect.orDie(ALCHEMY_DEV);

    /**
     * Dev: alchemy's presign binding. Its local branch injects an
     * `r2_s3_credentials` binding and serves the bucket on the Worker's
     * local S3 endpoint (`{worker url}/cdn-cgi/local/r2/s3`), so presigned
     * URLs resolve against the simulator with fixed local credentials: no
     * cloud calls, no minting, no deploy credentials at all. The binding is
     * APPLIED only in this dev branch: a deployed stage never runs it, so
     * the layer below never grows the token resource and CI needs no
     * token-creation rights. Providing the layer is a type-level
     * requirement only.
     *
     * Deployed: the ceremony-minted S3 credentials from the deploy
     * environment (see the live branch below). Unifying both modes on the
     * binding is the planned follow-up; it is blocked on the deployer
     * being allowed to mint API tokens (Account API Tokens Write), which
     * API-minted CI credentials reportedly cannot carry.
     */
    const devPresign = isDev ? yield* Cloudflare.R2.PresignGetObject(FilesBucket) : null;

    /**
     * Presigned GET URL for an object, ready for `<img src>` / direct
     * browser access. Pure SigV4 computation: no network call.
     *
     * Secrets resolve in the init phase per the secrets-env pattern: read
     * from the deploy environment (.env / shell), bound to the Worker as
     * secret_text, resolved from that binding at runtime.
     * Empty defaults keep the local dev loop zero-config: dev signs through
     * the local S3 endpoint above, so the placeholder creds are never used.
     * Deploys gate on the real values in worker.ts (requireEnv).
     * These minted credentials exist only for this signer: object reads
     * and writes go through the bucket binding above.
     */
    const accountId = yield* Config.String("R2_ACCOUNT_ID").pipe(Config.withDefault(""));
    const accessKeyId = yield* Config.String("R2_ACCESS_KEY_ID").pipe(Config.withDefault(""));
    const secretAccessKey = yield* Config.Redacted("R2_SECRET_ACCESS_KEY").pipe(Config.withDefault(Redacted.make("")));
    const r2 = new AwsClient({
      accessKeyId,
      secretAccessKey: Redacted.value(secretAccessKey),
    });

    const signReadUrl = (key: string, expiresIn = 900) =>
      isDev && devPresign
        ? // Same code the full cutover will run deployed: mint a presigned
          // URL for the local S3 endpoint.
          devPresign({ key, expiresIn }).pipe(Effect.orDie)
        : Effect.gen(function* () {
            // Empty credentials mean presigning is unavailable: the note
            // renders without its image rather than with a URL that cannot
            // possibly work. CI always receives minted credentials.
            if (!accountId || !accessKeyId || Redacted.value(secretAccessKey) === "") return null;
            // The bucket name is a deploy-time output of the FilesBucket
            // resource: bound via props env, readable from the worker env at
            // request time (alchemy wires the env ConfigProvider per request).
            const bucketName = yield* Config.String("R2_BUCKET_NAME");
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
  static readonly Live = Layer.effect(this, this.make).pipe(Layer.provide(Cloudflare.R2.ReadWriteBucketBinding), Layer.provide(Cloudflare.R2.PresignGetObjectToken));
}

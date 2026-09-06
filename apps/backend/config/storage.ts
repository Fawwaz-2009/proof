import * as Cloudflare from "alchemy/Cloudflare";
import { Context, Layer } from "effect";

/** Attachment objects for the notes demo. Private: every read is authorized by the note's owner. */
export const FilesBucket = Cloudflare.R2.Bucket("Files");

export class Files extends Context.Service<Files>()("Files", {
  make: Cloudflare.R2.ReadWriteBucket(FilesBucket),
}) {
  static readonly Live = Layer.effect(this, this.make).pipe(Layer.provide(Cloudflare.R2.ReadWriteBucketBinding));
}

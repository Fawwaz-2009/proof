import * as Cloudflare from "alchemy/Cloudflare";

/** Attachment objects for the notes demo. Private: every read is authorized by the note's owner. */
export const FilesBucket = Cloudflare.R2.Bucket("Files");

// Empty a PR stage's file bucket so `alchemy destroy` can delete it.
//
// Why this exists: `Cloudflare.R2.Bucket` deletion calls the R2 API directly,
// and R2 refuses to delete a non-empty bucket. A PR stage whose app ever stored
// an uploaded image therefore leaked its storage forever: the cleanup job's
// destroy always failed with `BucketNotEmpty`, and every retry failed the same
// way. Found by doing it: the first stage teardown here failed on exactly one
// 2.5MB note image.
//
// The cleanup credential can fix it: `CLOUDFLARE_API_TOKEN` lists and deletes R2
// objects through Cloudflare's REST API (both calls verified against a real
// bucket). No new dependency, no new secret, and the R2 keys the app uses stay
// read-only as designed.
//
//   bun scripts/purge-stage-bucket.ts --stage pr-12            # empty it
//   bun scripts/purge-stage-bucket.ts --stage pr-12 --dry-run  # report only
//
// Only `pr-*` stages are accepted, mirroring the workflow's own destroy guard:
// this deletes user data and must never be pointed at production by accident.

const PAGE_SIZE = 100;

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const stage = flag("--stage");
const dryRun = args.includes("--dry-run");

if (stage === undefined || !/^pr-\d+$/.test(stage)) {
  console.error("Usage: bun scripts/purge-stage-bucket.ts --stage pr-<number> [--dry-run]");
  console.error("Refusing: only pr-* stages are purgeable.");
  process.exit(2);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
if (accountId === undefined || accountId === "" || token === undefined || token === "") {
  console.error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required (the cleanup job already has both).");
  process.exit(1);
}

/** Buckets the stack created for this stage: `<slug>-files-<stage>-<hash>`. */
export const matchesStage = (name: string, stageName: string): boolean => name.includes(`-files-${stageName}-`);

/** A key goes into a URL path, so its slashes must not become path separators. */
export const encodeKey = (key: string): string => key.split("/").map(encodeURIComponent).join("%2F");

const api = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`;

const call = async (url: string, init?: RequestInit): Promise<{ ok: boolean; body: unknown }> => {
  const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init?.headers } });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    // keep the raw text; the caller reports it
  }
  return { ok: response.ok, body };
};

const listed = await call(`${api}?per_page=${PAGE_SIZE}`);
if (!listed.ok) {
  console.error(`Could not list buckets: ${JSON.stringify(listed.body).slice(0, 400)}`);
  process.exit(1);
}
const buckets = (listed.body as { result?: Array<{ name?: unknown }> }).result ?? [];
const targets = buckets.flatMap((bucket) => (typeof bucket.name === "string" && matchesStage(bucket.name, stage) ? [bucket.name] : []));

if (targets.length === 0) {
  console.log(`purge: no buckets match stage ${stage}; nothing to empty (a stage with no uploads destroys cleanly).`);
  process.exit(0);
}

let deleted = 0;
for (const bucket of targets) {
  for (;;) {
    const page = await call(`${api}/${bucket}/objects?per_page=${PAGE_SIZE}`);
    if (!page.ok) {
      console.error(`Could not list objects in ${bucket}: ${JSON.stringify(page.body).slice(0, 400)}`);
      process.exit(1);
    }
    const objects = (page.body as { result?: Array<{ key?: unknown }> }).result ?? [];
    const keys = objects.flatMap((object) => (typeof object.key === "string" ? [object.key] : []));
    if (keys.length === 0) break;
    if (dryRun) {
      console.log(`purge: would delete ${keys.length} object(s) from ${bucket}, first ${keys[0]}`);
      process.exit(0);
    }
    for (const key of keys) {
      const removed = await call(`${api}/${bucket}/objects/${encodeKey(key)}`, { method: "DELETE" });
      if (!removed.ok) {
        console.error(`Could not delete ${key} from ${bucket}: ${JSON.stringify(removed.body).slice(0, 300)}`);
        process.exit(1);
      }
      deleted += 1;
    }
  }
  console.log(`purge: emptied ${bucket}`);
}
console.log(`purge: deleted ${deleted} object(s) across ${targets.length} bucket(s) for ${stage}; destroy can proceed.`);

import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle";
import * as Effect from "effect/Effect";

/**
 * The one D1 database: Better Auth's tables, the development OTP mailbox, and
 * the application tables (the notes demo). Migrations ride the resource, so
 * they are applied by `alchemy deploy` / `alchemy dev` in every stage.
 */
export const AppDatabase = Effect.gen(function* () {
  return yield* Cloudflare.D1.Database("AppDatabase", {
    migrations: {
      dir: new URL("../migrations/d1", import.meta.url).pathname,
      table: "drizzle_migrations",
    },
  });
});

export const DomainData = Effect.gen(function* () {
  const database = yield* AppDatabase;
  const d1 = yield* Cloudflare.D1.QueryDatabase(database);
  const db = yield* Drizzle.D1(d1);
  return { database, d1, db };
});

export type DomainDb = Effect.Success<typeof DomainData>["db"];

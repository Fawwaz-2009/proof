import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Issued sign-in codes: the latest row per email is the live code. */
export const SignInCode = sqliteTable("sign_in_codes", {
  email: text("email").primaryKey(),
  code: text("code").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

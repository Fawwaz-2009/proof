import { createSelectSchema } from "drizzle-orm/effect-schema";
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Local-only OTP capture. Production authentication email is sent directly. */
export const DevMailbox = sqliteTable("dev_mailbox", {
  email: text("email").primaryKey(),
  code: text("code").notNull(),
  sentAt: integer("sent_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const DevMailboxSelectSchema = createSelectSchema(DevMailbox);

/** The demo resource: a per-user note with an optional attachment object in R2. */
export const Note = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    attachmentKey: text("attachment_key"),
    attachmentName: text("attachment_name"),
    attachmentType: text("attachment_type"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index("notes_user_id_idx").on(table.userId)],
);

export const NoteSelectSchema = createSelectSchema(Note);

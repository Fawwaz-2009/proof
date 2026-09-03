import { Effect } from "effect";
import { CurrentUser } from "../../contracts/index.ts";
import type { CreateNoteInput } from "../../contracts/index.ts";
import type { DomainDb } from "../../../config/database.ts";
import { Note } from "../../db/d1.ts";
import { renderNote } from "./render.ts";
import { authTemp } from "../../../config/auth-temp.ts";

export const createNote = (db: DomainDb, input: CreateNoteInput) =>
  Effect.gen(function* () {
    const auth = yield* authTemp;
    yield* Effect.log(auth)
    const user = yield* CurrentUser;
    const rows = yield* db.insert(Note).values({ id: crypto.randomUUID(), userId: user.id, title: input.title, body: input.body }).returning().pipe(Effect.orDie);
    const row = rows[0];
    if (!row) return yield* Effect.die("Insert returned no row");
    return renderNote(row);
  });

import { queryOptions } from "@tanstack/react-query";
import * as Effect from "effect/Effect";
import { getAppClient } from "../../../http-client";

export const notesQueryKey = ["notes"] as const;

export const notesQueryOptions = () =>
  queryOptions({
    queryKey: notesQueryKey,
    queryFn: async () => {
      const client = await getAppClient();
      const page = await Effect.runPromise(client.notes.listNotes());
      // HttpApiClient decodes rows into NoteView class instances; SSR
      // dehydration (seroval) serializes plain data only, so strip prototypes.
      return { notes: page.notes.map((note) => ({ ...note })) };
    },
    retry: false,
  });

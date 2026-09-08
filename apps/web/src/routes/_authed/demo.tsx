import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as Effect from "effect/Effect";
import { MaxImageBytes } from "@proof/backend/contract";
import { getAppClient, mutationErrorMessage } from "../../http-client";
import { notesQueryKey, notesQueryOptions } from "./demo/-queries";
import * as z from "zod";

export const Route = createFileRoute("/_authed/demo")({
  // Server-rendered cold loads prefetch here (binding transport, cookies forwarded);
  // the result dehydrates into the HTML, so useSuspenseQuery never refetches.
  // (ensureQueryData is deprecated in query-core 5.102; query + staleTime 'static'
  // is its replacement: use cached data when present, fetch when missing.)
  loader: ({ context }) => context.queryClient.query({ ...notesQueryOptions(), staleTime: "static" }),
  component: Demo,
  errorComponent: DemoError,
});

const noteFormSchema = z.object({
  title: z.string().min(1, "Give the note a title.").max(200, "Title must be at most 200 characters."),
  body: z.string().max(10_000, "Body must be at most 10,000 characters."),
});

const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-800 dark:bg-zinc-900";

type Status = { kind: "ok" | "error"; text: string };

function Demo() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(notesQueryOptions());
  const [image, setImage] = useState<File | undefined>();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [formError, setFormError] = useState<string>();
  const [status, setStatus] = useState<Status>();

  const createNote = useMutation({
    mutationFn: async (input: { title: string; body: string; image?: File }) => {
      const client = await getAppClient();
      // The multipart payload rides to the typed client as FormData: the
      // contract marks the payload as multipart, so the client encodes it.
      const formData = new FormData();
      formData.append("title", input.title.trim());
      formData.append("body", input.body);
      if (input.image) formData.append("image", input.image);
      return Effect.runPromise(client.notes.createNote({ payload: formData }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesQueryKey });
      setTitle("");
      setBody("");
      setImage(undefined);
      setStatus({ kind: "ok", text: "Note added." });
    },
    onError: (error) => setStatus({ kind: "error", text: mutationErrorMessage(error, "Could not create the note.") }),
  });

  const destroyNote = useMutation({
    mutationFn: async (id: string) => {
      const client = await getAppClient();
      return Effect.runPromise(client.notes.destroyNote({ params: { id } }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notesQueryKey }),
    onError: (error) => setStatus({ kind: "error", text: mutationErrorMessage(error, "Could not delete the note.") }),
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = noteFormSchema.safeParse({ title, body });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    // Client-side guard is instant UX feedback; the server's multipart
    // parser remains the backstop (its 413 arrives as a defect).
    if (image && image.size > MaxImageBytes) {
      setFormError(`Images are capped at ${Math.round(MaxImageBytes / (1024 * 1024))} MB.`);
      return;
    }
    setFormError(undefined);
    createNote.mutate({ title: parsed.data.title, body: parsed.data.body, image });
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">One of everything</h1>
      <p className="mt-2 leading-relaxed text-zinc-600 dark:text-zinc-400">
        A note with an image, end to end: the row in D1, the file in a private bucket, the link signed for you alone. Every feature you add takes this shape.
      </p>

      <form onSubmit={submit} className="mt-8 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <label htmlFor="title" className="text-sm font-semibold">
          Title
        </label>
        <input
          id="title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-invalid={Boolean(formError)}
          placeholder="What is this note about?"
          autoComplete="off"
          className={inputClass}
        />

        <label htmlFor="body" className="mt-4 block text-sm font-semibold">
          Body
        </label>
        <textarea id="body" name="body" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Optional details" rows={3} className={inputClass} />

        <label htmlFor="image" className="mt-4 block text-sm font-semibold">
          Image (optional)
        </label>
        <input
          id="image"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) => setImage(event.target.files?.[0] ?? undefined)}
          className="mt-1 block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-zinc-700 dark:text-zinc-400 dark:file:bg-white dark:file:text-zinc-950"
        />

        <div className="mt-5 flex items-center gap-3">
          <button
            type="submit"
            disabled={createNote.isPending}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {createNote.isPending ? "Working..." : "Add note"}
          </button>
          {status ? (
            <p className={status.kind === "ok" ? "text-sm text-emerald-600 dark:text-emerald-400" : "text-sm text-red-600 dark:text-red-400"}>{status.text}</p>
          ) : null}
        </div>
        {formError ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{formError}</p> : null}
      </form>

      {data.notes.length === 0 ? <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-500">No notes yet. Add the first one above.</p> : null}

      <ul className="mt-6 flex flex-col gap-4">
        {data.notes.map((note) => (
          <li key={note.id} className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-4">
              <strong>{note.title}</strong>
              <button
                type="button"
                disabled={destroyNote.isPending}
                onClick={() => destroyNote.mutate(note.id)}
                className="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                {destroyNote.isPending && destroyNote.variables === note.id ? "Deleting..." : "Delete"}
              </button>
            </div>
            {note.body ? <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">{note.body}</p> : null}
            {note.imageUrl ? (
              <>
                <img src={note.imageUrl} alt={note.title} className="mt-3 max-h-64 rounded-lg border border-zinc-200 dark:border-zinc-800" />
                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-500">This link is signed for you alone.</p>
              </>
            ) : null}
            <footer className="mt-3 border-t border-zinc-200 pt-2.5 dark:border-zinc-800">
              <span className="text-xs text-zinc-500 dark:text-zinc-500">{new Date(note.createdAt).toLocaleString()}</span>
            </footer>
          </li>
        ))}
      </ul>
    </main>
  );
}

function DemoError() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-3xl font-bold tracking-tight">Could not load your notes.</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">Check your connection and try again.</p>
      <a
        href="/demo"
        className="mt-6 inline-block rounded-lg border border-zinc-200 px-4 py-2 font-semibold hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
      >
        Retry
      </a>
    </main>
  );
}

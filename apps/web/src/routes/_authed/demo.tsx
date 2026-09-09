import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DeleteNoteButton } from "./demo/-components/delete-note-button";
import { NoteForm } from "./demo/-components/note-form";
import { notesQueryOptions } from "./demo/-queries";

export const Route = createFileRoute("/_authed/demo")({
  // Server-rendered cold loads prefetch here (binding transport, cookies forwarded);
  // the result dehydrates into the HTML, so useSuspenseQuery never refetches.
  // (ensureQueryData is deprecated in query-core 5.102; query + staleTime 'static'
  // is its replacement: use cached data when present, fetch when missing.)
  loader: ({ context }) => context.queryClient.query({ ...notesQueryOptions(), staleTime: "static" }),
  component: Demo,
  errorComponent: DemoError,
});

// The route file is the page: loader, layout, the notes list. Supporting UI
// lives in the dash-prefixed -components folder beside it: TanStack Router
// excludes it from the route tree, while the imports keep it one glance
// away. The form (and its create mutation) is note-form; the delete button
// (and its destroy mutation) is delete-note-button.
function Demo() {
  const { data } = useSuspenseQuery(notesQueryOptions());

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">One of everything</h1>
      <p className="mt-2 leading-relaxed text-zinc-600 dark:text-zinc-400">
        A note with an image, end to end: the row in D1, the file in a private bucket, the link signed for you alone. Every feature you add takes this shape.
      </p>

      <NoteForm />

      {data.notes.length === 0 ? <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-500">No notes yet. Add the first one above.</p> : null}

      <ul className="mt-6 flex flex-col gap-4">
        {data.notes.map((note) => (
          <li key={note.id} className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-4">
              <strong>{note.title}</strong>
              <DeleteNoteButton id={note.id} />
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

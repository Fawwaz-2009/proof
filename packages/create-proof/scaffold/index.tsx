import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [{ name: "description", content: "The application is live." }],
  }),
});

// The stage strip only speaks on preview deploys: production never calls
// itself a preview, and neither should your app.
const isPreview = (stage: string) => stage.startsWith("pr-");

function Home() {
  const { appName, stage } = Route.useLoaderData() ?? { appName: "Proof", stage: "" };

  return (
    <div className="min-h-svh">
      {isPreview(stage) ? (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-1.5 text-center text-xs font-semibold tracking-wide text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
          PROOF &middot; {stage.toUpperCase()} &middot; DESTROYED ON MERGE
        </div>
      ) : null}

      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="font-bold tracking-tight">{appName}</span>
        <Link to="/login" className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-6 pb-16 pt-14 sm:pt-20">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{appName} is live.</h1>
        <p className="mt-5 text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          Scaffolded minutes ago with everything that matters: auth with emailed codes, a database, private file storage, and a proof for every pull request.
        </p>
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-500">
          This page is yours to replace: <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-900">apps/web/src/routes/index.tsx</code>
        </p>

        <div className="mt-8 flex gap-3">
          <Link to="/demo" className="rounded-lg bg-amber-500 px-5 py-2.5 font-semibold text-zinc-950 hover:bg-amber-400">
            Open the demo
          </Link>
          <Link to="/login" className="rounded-lg border border-zinc-200 px-5 py-2.5 font-semibold hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
            Sign in
          </Link>
        </div>

        <section className="mt-14 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
          <h2 className="font-bold">One of everything</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            A note with an image, end to end. The row lives in the database, the file in a private bucket, and the link is signed for the one person allowed to see it.
            Make one; every feature you add will take this shape.
          </p>
        </section>
      </main>

      <footer className="border-t border-zinc-200 px-6 py-8 dark:border-zinc-800">
        <div className="mx-auto max-w-2xl text-sm text-zinc-500 dark:text-zinc-500">
          <a
            href="https://github.com/Fawwaz-2009/proof"
            className="font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Built with proof
          </a>
          <span className="ml-2">Effect v4 &middot; Alchemy v2 &middot; TanStack Start &middot; D1 &middot; R2</span>
        </div>
      </footer>
    </div>
  );
}

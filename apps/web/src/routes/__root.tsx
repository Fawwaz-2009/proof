import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import type { ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";
import appCss from "../styles.css?url";
import geistFont from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";

interface RouterContext {
  queryClient: QueryClient;
}

/**
 * Runtime identity from the Worker's bindings: the wordmark and page title
 * follow APP_NAME, and STAGE tells preview deploys where they are. Server
 * function so the env import never reaches the client bundle.
 */
export const getAppMeta = createServerFn({ method: "GET" }).handler(async () => {
  return {
    appName: (env.APP_NAME as string | undefined) ?? "Proof",
    stage: (env.STAGE as string | undefined) ?? "",
  };
});

export const Route = createRootRouteWithContext<RouterContext>()({
  loader: () => getAppMeta(),
  head: ({ match }) => ({
    meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, { title: match.loaderData?.appName ?? "Proof" }],
    // The font is discovered only after the stylesheet parses, which leaves the
    // first paint in a fallback face. Preloading races it with the CSS instead.
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preload", href: geistFont, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
    ],
  }),
  component: RootComponent,
  // Without this, any request that 404s during dev teardown logs the router's
  // "notFoundError was encountered" warning on shutdown.
  notFoundComponent: NotFound,
});

function RootComponent() {
  return (
    <Document>
      <Outlet />
    </Document>
  );
}

function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">The page you asked for does not exist.</p>
      <a className="mt-6 inline-block rounded-lg border border-zinc-200 px-4 py-2 font-semibold hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900" href="/">
        Back to the start
      </a>
    </main>
  );
}

function Document({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-white font-sans text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

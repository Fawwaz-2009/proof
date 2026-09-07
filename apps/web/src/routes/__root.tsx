import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import appCss from "../styles.css?url";
import type { QueryClient } from "@tanstack/react-query";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "description", content: "Alchemy Flare: a starting template on the Effect + Cloudflare backbone." },
      { title: "Alchemy Flare" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
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
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="mt-2 text-muted-foreground">The page you asked for does not exist.</p>
      <a className="mt-6 inline-block rounded-lg border bg-card px-4 py-2 font-semibold hover:bg-accent hover:text-accent-foreground" href="/">
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
      <body className="antialiased">
        {children}
        <Toaster />
        <Scripts />
      </body>
    </html>
  );
}

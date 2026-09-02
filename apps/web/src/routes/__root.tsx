import { RegistryProvider } from "@effect/atom-react";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "description", content: "Sufra — a starting template on the Effect + Cloudflare backbone." },
      { title: "Sufra" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
  // Without this, any request that 404s during dev teardown logs the router's
  // "notFoundError was encountered" warning on shutdown.
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <main className="page">
      <h1>Page not found</h1>
      <p className="page-copy">The page you asked for does not exist.</p>
      <a className="button primary" href="/">
        Back to the start
      </a>
    </main>
  );
}
function RootComponent() {
  return (
    <Document>
      <RegistryProvider>
        <Outlet />
      </RegistryProvider>
    </Document>
  );
}

function Document({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

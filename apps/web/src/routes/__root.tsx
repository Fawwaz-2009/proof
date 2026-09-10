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
// The production origin: canonical, og:url, and og:image point here even
// from a preview stage, which is what scrapers and search engines should
// index. The template ships it empty (the head omits canonical and the OG
// image tags while it is empty) and fills it once a final origin exists:
// https://<slug>.<ROOT_DOMAIN> after the domain lands. Proof has its
// domain, so it carries the real one.
const SITE_URL = "https://proof.fawwaz.dev";

export const getAppMeta = createServerFn({ method: "GET" }).handler(async () => {
  return {
    appName: (env.APP_NAME as string | undefined) ?? "App",
    stage: (env.STAGE as string | undefined) ?? "",
    url: SITE_URL,
  };
});

export const Route = createRootRouteWithContext<RouterContext>()({
  loader: () => getAppMeta(),
  head: ({ match }) => {
    const { appName, url } = match.loaderData ?? { appName: "App", url: "" };
    const description =
      "Proof is a starter with a pipeline: an agent builds each issue in isolation, every pull request ships with a running proof on your own domain, and merge ships it.";
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: appName },
        { name: "description", content: description },
        { property: "og:title", content: appName },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        ...(url
          ? [
              { property: "og:url", content: url },
              { property: "og:image", content: `${url}/og.png` },
              { property: "og:image:width", content: "1200" },
              { property: "og:image:height", content: "630" },
              { name: "twitter:card", content: "summary_large_image" },
              { name: "twitter:image", content: `${url}/og.png` },
            ]
          : [{ name: "twitter:card", content: "summary" }]),
        { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#ffffff" },
        { name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#09090b" },
      ],
      // The font is discovered only after the stylesheet parses, which leaves the
      // first paint in a fallback face. Preloading races it with the CSS instead.
      links: [
        ...(url ? [{ rel: "canonical", href: url }] : []),
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "stylesheet", href: appCss },
        { rel: "preload", href: geistFont, as: "font", type: "font/woff2", crossOrigin: "anonymous" as const },
      ],
    };
  },
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
        {/* Dark mode is class-based (shadcn variables read html.dark); this
            syncs the OS preference before first paint. The full three-way
            toggle (light, dark, system with localStorage) is the same line
            with a stored preference folded in: see docs/faq.md. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.toggle("dark", window.matchMedia("(prefers-color-scheme: dark)").matches)`,
          }}
        />
      </head>
      <body className="bg-white font-sans text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { createQueryClient } from "./client/query";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const queryClient = createQueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    Wrap: ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
    scrollRestoration: true,
  });
  // Loader-prefetched queries (ensureQueryData) dehydrate into the SSR HTML and
  // rehydrate on the client, so useSuspenseQuery never refetches or mismatches.
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

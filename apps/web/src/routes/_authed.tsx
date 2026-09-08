import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "../auth-client.ts";
import { getAppMeta } from "./__root";
import { getSession } from "../auth.functions.ts";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async () => {
    const session = await getSession();

    if (!session?.user) {
      throw redirect({ to: "/login" });
    }

    return { user: session.user };
  },
  loader: async () => {
    const { appName } = await getAppMeta();
    return { appName };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { appName } = Route.useLoaderData();

  const signOut = async () => {
    await authClient.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="min-h-svh">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <a href="/" className="font-bold tracking-tight">
            {appName}
          </a>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            Sign out
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}

import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "../auth-client.ts";
import { getSession } from "../auth.functions.ts";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async () => {
    const session = await getSession();

    if (!session?.user) {
      throw redirect({ to: "/login" });
    }

    return { user: session.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const signOut = async () => {
    await authClient.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="min-h-svh">
      <header className="flex items-center justify-between border-b bg-card px-6 py-3">
        <a className="font-bold" href="/">
          Sufra
        </a>
        <Button variant="outline" size="sm" onClick={signOut}>
          Sign out
        </Button>
      </header>
      <Outlet />
    </div>
  );
}

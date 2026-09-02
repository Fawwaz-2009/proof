import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "../auth-client.ts";
import { getSession } from "../auth.functions.ts";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) {
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
    <div className="authed-shell">
      <header className="topbar">
        <a className="topbar-brand" href="/">
          Sufra
        </a>
        <button className="button small" type="button" onClick={signOut}>
          Sign out
        </button>
      </header>
      <Outlet />
    </div>
  );
}

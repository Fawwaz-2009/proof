import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-20">
      <section className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">Starting template</p>
        <h1 className="mt-2 text-6xl font-bold tracking-tight">Starting Flare</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          One Alchemy stack, two Workers: a private Effect backend owning D1 and R2, and this TanStack Start site as the only public ingress. Sign in with an emailed code
          and try the notes demo.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild>
            <Link to="/demo">Open the demo</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Database</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            One D1 database carries Better Auth, the development OTP mailbox, and the demo tables. Migrations ride the stack.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bucket</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            A private R2 bucket holds note attachments. Objects are only reachable through owner-authorized endpoints.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Auth</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Passwordless email OTP. Non-prod stages capture codes in a development mailbox, so sign-in never needs real email.
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

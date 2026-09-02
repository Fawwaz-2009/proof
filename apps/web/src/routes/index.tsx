import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="landing">
      <section className="hero">
        <p className="hero-eyebrow">Starting template</p>
        <h1>Sufra</h1>
        <p className="hero-copy">
          One Alchemy stack, two Workers: a private Effect backend owning D1 and R2, and this TanStack Start site as the only public ingress. Sign in with an emailed code
          and try the notes demo.
        </p>
        <div className="hero-actions">
          <Link className="button primary" to="/demo">
            Open the demo
          </Link>
          <Link className="button" to="/login">
            Sign in
          </Link>
        </div>
      </section>
      <section className="landing-grid">
        <article className="card">
          <h2>Database</h2>
          <p>One D1 database carries Better Auth, the development OTP mailbox, and the demo tables. Migrations ride the stack.</p>
        </article>
        <article className="card">
          <h2>Bucket</h2>
          <p>A private R2 bucket holds note attachments. Objects are only reachable through owner-authorized endpoints.</p>
        </article>
        <article className="card">
          <h2>Auth</h2>
          <p>Passwordless email OTP. Non-prod stages capture codes in a development mailbox, so sign-in never needs real email.</p>
        </article>
      </section>
    </main>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { authClient } from "../auth-client.ts";

export const Route = createFileRoute("/login")({
  component: Login,
});

const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-800 dark:bg-zinc-900";

function Login() {
  const { appName } = Route.useLoaderData() ?? { appName: "Proof" };

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const sendCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    setSubmitting(true);
    setError(undefined);

    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: normalizedEmail,
        type: "sign-in",
      });

      if (result.error) {
        setError(result.error.message || "We could not send a sign-in code.");
        return;
      }

      setEmail(normalizedEmail);
      setStep("code");
    } catch {
      setError("We could not send a sign-in code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);

    try {
      const result = await authClient.signIn.emailOtp({ email, otp });

      if (result.error) {
        setError(result.error.message || "We could not verify that code.");
        return;
      }

      window.location.href = "/demo";
    } catch {
      setError("We could not verify that code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-sm px-6 py-24">
      <h1 className="text-2xl font-bold tracking-tight">Sign in to {appName}</h1>
      <div className="mt-6 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        {step === "email" ? (
          <form onSubmit={sendCode}>
            <label htmlFor="email" className="text-sm font-semibold">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={submitting}
              className="mt-4 w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {submitting ? "Sending..." : "Send a code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode}>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">We sent a 6-digit code to {email}.</p>
            <label htmlFor="otp" className="mt-3 block text-sm font-semibold">
              Code
            </label>
            <input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={submitting}
              className="mt-4 w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {submitting ? "Verifying..." : "Verify and continue"}
            </button>
          </form>
        )}
        {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </div>
      <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">Passwordless: the first sign-in with any email creates the account.</p>
    </main>
  );
}

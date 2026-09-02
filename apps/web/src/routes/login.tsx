import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { authClient } from "../auth-client.ts";
import { getDevMailbox } from "../dev-api.ts";
import { shouldAutofillDevMailbox } from "../dev-mailbox-mode.ts";

export const Route = createFileRoute("/login")({
  component: Login,
});

const devMailboxAutofillEnabled = shouldAutofillDevMailbox(import.meta.env.DEV, import.meta.env.VITE_DEV_MAILBOX_ENABLED);

function Login() {
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

      if (devMailboxAutofillEnabled) {
        try {
          const message = await getDevMailbox(normalizedEmail);
          setOtp(message.code);
        } catch {
          // Email delivery still works; local autofill is a development aid.
        }
      }
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
    <main className="auth-shell">
      <h1>Sign in to Sufra</h1>
      {step === "email" ? (
        <form className="auth-form" onSubmit={sendCode}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          <button className="button primary" type="submit" disabled={submitting}>
            {submitting ? "Sending..." : "Send a code"}
          </button>
          {devMailboxAutofillEnabled ? <p className="hint">Development mode: the code is captured in the dev mailbox and filled in for you.</p> : null}
        </form>
      ) : (
        <form className="auth-form" onSubmit={verifyCode}>
          <p className="hint">We sent a 6-digit code to {email}.</p>
          <label htmlFor="otp">Code</label>
          <input id="otp" inputMode="numeric" autoComplete="one-time-code" required value={otp} onChange={(event) => setOtp(event.target.value)} />
          <button className="button primary" type="submit" disabled={submitting}>
            {submitting ? "Verifying..." : "Verify and continue"}
          </button>
        </form>
      )}
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}

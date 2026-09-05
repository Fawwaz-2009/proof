import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { authClient } from "../auth-client.ts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/login")({
  component: Login,
});

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
      <h1 className="text-2xl font-bold">Sign in to Sufra</h1>
      <Card className="mt-6">
        <CardContent>
          {step === "email" ? (
            <form onSubmit={sendCode}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </Field>
              </FieldGroup>
              <Button className="mt-4 w-full" type="submit" disabled={submitting}>
                {submitting ? "Sending..." : "Send a code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={verifyCode}>
              <FieldGroup>
                <Field>
                  <FieldDescription>We sent a 6-digit code to {email}.</FieldDescription>
                  <FieldLabel htmlFor="otp">Code</FieldLabel>
                  <Input id="otp" inputMode="numeric" autoComplete="one-time-code" required value={otp} onChange={(event) => setOtp(event.target.value)} />
                </Field>
              </FieldGroup>
              <Button className="mt-4 w-full" type="submit" disabled={submitting}>
                {submitting ? "Verifying..." : "Verify and continue"}
              </Button>
            </form>
          )}
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
      <p className="mt-4 text-sm text-muted-foreground">Passwordless: the first sign-in with any email creates the account.</p>
    </main>
  );
}

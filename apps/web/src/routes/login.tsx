import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { authClient } from "../auth-client.ts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const { appName } = Route.useLoaderData() ?? { appName: "App" };

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
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sign in to {appName}</CardTitle>
          <CardDescription>Passwordless: the first sign-in with any email creates the account.</CardDescription>
        </CardHeader>
        <CardContent>
          {step === "email" ? (
            <form onSubmit={sendCode} className="flex flex-col gap-3">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Sending..." : "Send a code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">We sent a 6-digit code to {email}.</p>
              <Label htmlFor="otp">Code</Label>
              <Input id="otp" inputMode="numeric" autoComplete="one-time-code" required value={otp} onChange={(event) => setOtp(event.target.value)} />
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Verifying..." : "Verify and continue"}
              </Button>
            </form>
          )}
          {error ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

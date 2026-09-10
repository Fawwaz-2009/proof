import { useMutation } from "@tanstack/react-query";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { useForm } from "react-hook-form";
import { authClient } from "../../auth-client.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "./-components/auth-card";

export const Route = createFileRoute("/login/")({
  validateSearch: (search: Record<string, unknown>): { email?: string } => ({
    email: typeof search.email === "string" ? search.email : undefined,
  }),
  component: Login,
});

/**
 * The same form pattern as every form in the app: react-hook-form + an
 * Effect Schema (Standard Schema resolver) for instant field validation,
 * useMutation for the async call, one alert for server errors. The only
 * per-form difference is the client a mutation calls: product routes use
 * the contract-derived client, auth uses better-auth's.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emailFormSchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    email: Schema.String.check(Schema.makeFilter((value) => EMAIL_PATTERN.test(value), { message: "Enter a valid email address.", identifier: "LoginEmail" })),
  }),
);
type EmailValues = typeof emailFormSchema.Type;

function Login() {
  const { appName } = Route.useLoaderData() ?? { appName: "App" };
  const { email: returningEmail } = Route.useSearch();
  const navigate = useNavigate();

  const emailForm = useForm<EmailValues>({
    resolver: standardSchemaResolver(emailFormSchema),
    defaultValues: { email: returningEmail ?? "" },
  });

  const sendCode = useMutation({
    mutationFn: async (values: EmailValues) => {
      const normalized = values.email.trim().toLowerCase();
      const result = await authClient.emailOtp.sendVerificationOtp({ email: normalized, type: "sign-in" });
      if (result.error) throw new Error(result.error.message || "We could not send a sign-in code.");
      return normalized;
    },
    onSuccess: (normalized) => {
      navigate({ to: "/login/code", search: { email: normalized } });
    },
  });

  return (
    <AuthCard title={`Sign in to ${appName}`} description="Passwordless: the first sign-in with any email creates the account.">
      <form onSubmit={emailForm.handleSubmit((values) => sendCode.mutate(values))} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...emailForm.register("email")}
            aria-invalid={Boolean(emailForm.formState.errors.email)}
          />
          {emailForm.formState.errors.email ? (
            <p className="text-sm text-destructive" role="alert">
              {emailForm.formState.errors.email.message}
            </p>
          ) : null}
        </div>
        <Button type="submit" disabled={sendCode.isPending} className="w-full">
          {sendCode.isPending ? "Sending..." : "Send a code"}
        </Button>
        {sendCode.isError ? (
          <p className="text-sm text-destructive" role="alert">
            {sendCode.error instanceof Error ? sendCode.error.message : "We could not send a sign-in code. Please try again."}
          </p>
        ) : null}
      </form>
    </AuthCard>
  );
}

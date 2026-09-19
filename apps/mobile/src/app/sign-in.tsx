import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Schema from "effect/Schema";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Card, ErrorText, MutedText, TextField } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { colors, spacing } from "@/lib/theme";

/**
 * The same form pattern as every form in the app: react-hook-form driving
 * fields, an Effect Schema (Standard Schema resolver) validating them, one
 * mutation per step. The only difference from web is the client the
 * mutation calls: better-auth's expo client, whose plugin keeps the session
 * cookie in SecureStore.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emailFormSchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    email: Schema.String.check(Schema.makeFilter((value) => EMAIL_PATTERN.test(value), { message: "Enter a valid email address.", identifier: "LoginEmail" })),
  }),
);
type EmailValues = typeof emailFormSchema.Type;

const codeFormSchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    code: Schema.String.check(Schema.isMinLength(6, { message: "The code is 6 digits." }), Schema.isMaxLength(6, { message: "The code is 6 digits." })),
  }),
);
type CodeValues = typeof codeFormSchema.Type;

export default function SignIn() {
  const [email, setEmail] = useState<string | null>(null);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {email ? <CodeStep email={email} onBack={() => setEmail(null)} /> : <EmailStep onSent={setEmail} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function EmailStep({ onSent }: { onSent: (email: string) => void }) {
  const form = useForm<EmailValues>({ resolver: standardSchemaResolver(emailFormSchema), defaultValues: { email: "" } });

  const sendCode = useMutation({
    mutationFn: async (values: EmailValues) => {
      const normalized = values.email.trim().toLowerCase();
      const result = await authClient.emailOtp.sendVerificationOtp({ email: normalized, type: "sign-in" });
      if (result.error) throw new Error(result.error.message || "We could not send a sign-in code.");
      return normalized;
    },
    onSuccess: onSent,
  });

  return (
    <View>
      <Text style={styles.title}>Sign in</Text>
      <MutedText>Passwordless: the first sign-in with any email creates the account.</MutedText>
      <Card>
        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <TextField
              label="Email"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@example.com"
            />
          )}
        />
        <Button
          label={sendCode.isPending ? "Sending..." : "Send a code"}
          onPress={form.handleSubmit((values) => sendCode.mutate(values))}
          disabled={sendCode.isPending}
        />
        {sendCode.isError ? (
          <ErrorText>{sendCode.error instanceof Error ? sendCode.error.message : "We could not send a sign-in code. Please try again."}</ErrorText>
        ) : null}
      </Card>
    </View>
  );
}

function CodeStep({ email, onBack }: { email: string; onBack: () => void }) {
  // Capture stages: a six-digit local part IS the code (see
  // apps/backend/config/auth.ts), so the field prefills with no backend
  // call. Production codes are random and arrive by email.
  const chosen = /^(\d{6})@/.exec(email)?.[1];

  const form = useForm<CodeValues>({ resolver: standardSchemaResolver(codeFormSchema), defaultValues: { code: chosen ?? "" } });

  const verifyCode = useMutation({
    mutationFn: async (values: CodeValues) => {
      const result = await authClient.signIn.emailOtp({ email, otp: values.code });
      if (result.error) throw new Error(result.error.message || "We could not verify that code.");
    },
    onSuccess: async () => {
      // The notes gate fetches the session itself; navigating immediately
      // is enough, and the fetch it makes is authenticated because the
      // sign-in response already stored the cookie.
      router.replace("/notes");
    },
  });

  return (
    <View>
      <Text style={styles.title}>Enter your code</Text>
      <MutedText>{`We sent a 6-digit code to ${email}.`}</MutedText>
      <Card>
        <Controller
          control={form.control}
          name="code"
          render={({ field, fieldState }) => (
            <TextField
              label="Code"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              autoComplete="one-time-code"
              keyboardType="number-pad"
              maxLength={6}
            />
          )}
        />
        {chosen ? <MutedText>Dev shortcut: the code is the six digits in the address. No email was sent.</MutedText> : null}
        <Button
          label={verifyCode.isPending ? "Verifying..." : "Verify and continue"}
          onPress={form.handleSubmit((values) => verifyCode.mutate(values))}
          disabled={verifyCode.isPending}
        />
        {verifyCode.isError ? (
          <ErrorText>{verifyCode.error instanceof Error ? verifyCode.error.message : "We could not verify that code. Please try again."}</ErrorText>
        ) : null}
        <Button label="Change email" variant="secondary" onPress={onBack} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    backgroundColor: colors.background,
    flexGrow: 1,
    gap: spacing.md,
    justifyContent: "center",
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
});

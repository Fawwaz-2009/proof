import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";
import { colors, radius, spacing } from "@/lib/theme";

/**
 * Sized-to-purpose primitives, not a component library: the web template
 * ships no components either, and a starter should not choose your UI kit.
 * Swap these for whatever kit you pick; the screens only use these props.
 */

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Button({
  label,
  onPress,
  disabled,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.buttonSecondary,
        variant === "danger" && styles.buttonDanger,
        (pressed || disabled) && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.buttonLabel, variant !== "primary" && styles.buttonLabelSecondary]}>{label}</Text>
    </Pressable>
  );
}

export function TextField({ label, error, ...input }: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={[styles.input, error ? styles.inputError : null]} {...input} />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text style={styles.errorText}>{children}</Text>;
}

export function MutedText({ children }: { children: ReactNode }) {
  return <Text style={styles.mutedText}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  buttonSecondary: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
  },
  buttonDanger: {
    backgroundColor: colors.card,
    borderColor: colors.danger,
    borderWidth: 1,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  buttonLabelSecondary: {
    color: colors.text,
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
  },
  mutedText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});

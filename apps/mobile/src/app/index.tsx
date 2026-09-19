import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { MissingConfig } from "@/components/missing-config";
import { authClient } from "@/lib/auth-client";
import { apiUrl } from "@/lib/env";
import { colors } from "@/lib/theme";

/** The gate: unfinished config explains itself, then session decides. */
export default function Index() {
  const { data: session, isPending } = authClient.useSession();

  if (!apiUrl) return <MissingConfig />;
  if (isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  return <Redirect href={session ? "/notes" : "/sign-in"} />;
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
  },
});

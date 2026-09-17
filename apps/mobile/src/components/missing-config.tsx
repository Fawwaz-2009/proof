import { StyleSheet, Text, View } from "react-native";
import { Card, MutedText } from "@/components/ui";
import { colors, spacing } from "@/lib/theme";

/**
 * A build with no stage URL is a setup step, not a crash: this screen names
 * the two commands that fix it.
 */
export function MissingConfig() {
  return (
    <View style={styles.screen}>
      <Card>
        <Text style={styles.title}>Point the app at a stage</Text>
        <MutedText>This build baked no API URL. Copy apps/mobile/.env.example to apps/mobile/.env, then run `bun run dev` in the repo root.</MutedText>
        <MutedText>
          Set EXPO_PUBLIC_API_URL to the website URL it prints: localhost for the simulator, your Mac's LAN IP for a physical phone. Restart `bunx expo start` after
          editing env.
        </MutedText>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
});

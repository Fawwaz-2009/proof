import { StyleSheet, Text, View } from "react-native";

/**
 * Which preview is this?
 *
 * A published update is meant to be indistinguishable from any other at a
 * glance, and that is precisely the reviewer's problem: after tapping a link
 * there is nothing on screen that says which PR, which revision, or which
 * backend you are actually looking at. The Expo dev menu can show a runtime
 * hash, but a hash is not an answer.
 *
 * The publish step bakes these three values into the bundle that the phone
 * downloads, so they identify the *running* update and not the installed app:
 * process.env literals are inlined by Metro at export time, which is why they
 * are read once here and nowhere else. Production builds carry none of them and
 * render nothing.
 */
const previewPr = process.env.EXPO_PUBLIC_PREVIEW_PR;
const previewRevision = process.env.EXPO_PUBLIC_PREVIEW_REVISION;
const backendUrl = process.env.EXPO_PUBLIC_API_URL;

export function PreviewLabel() {
  if (previewPr === undefined && previewRevision === undefined) return null;
  const host = backendUrl?.replace(/^https?:\/\//, "") ?? "backend unknown";
  return (
    <View style={styles.bar} pointerEvents="none">
      <Text style={styles.text} numberOfLines={1}>
        {`PR ${previewPr ?? "?"} · ${(previewRevision ?? "unknown").slice(0, 7)} · ${host}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    // Deliberately not a theme colour: a preview marker must be visually
    // distinct from the product's palette, not part of it.
    backgroundColor: "#fde68a",
    bottom: 0,
    left: 0,
    paddingVertical: 4,
    position: "absolute",
    right: 0,
  },
  text: {
    color: "#1f2937",
    fontSize: 11,
    fontWeight: "600",
  },
});

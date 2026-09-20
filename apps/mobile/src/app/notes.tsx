import { MaxImageBytes } from "@app/backend/contract";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { DeleteNoteButton } from "@/components/delete-note-button";
import { Button, Card, ErrorText, MutedText, TextField } from "@/components/ui";
import { getAppClient, mutationErrorMessage } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { resolveApiUrl } from "@/lib/env";
import { colors, spacing } from "@/lib/theme";

/**
 * The demo, mobile edition: the same exhibit as the web's /demo. One
 * entity, one image, the full path: the row in D1, the file in a private
 * bucket, the link signed for the one person allowed to see it. Every
 * feature you add takes this shape.
 */
const noteFormSchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    title: Schema.String.check(
      Schema.isMinLength(1, { message: "Give the note a title." }),
      Schema.isMaxLength(200, { message: "Title must be at most 200 characters." }),
    ),
    body: Schema.String.check(Schema.isMaxLength(10_000, { message: "Body must be at most 10,000 characters." })),
  }),
);
type NoteFormValues = typeof noteFormSchema.Type;

const MAX_IMAGE_MB = Math.round(MaxImageBytes / (1024 * 1024));

export default function Notes() {
  const queryClient = useQueryClient();
  // The gate reads a fetched session, not the hook's cache: on native the
  // cache is only hydrated by its own fetches, so right after sign-in
  // `useSession()` can report stale-empty and bounce a signed-in user.
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data, error } = await authClient.getSession();
      // "No session" and "could not ask" are different states: the first
      // redirects, the second shows an error with a retry. Collapsing them
      // signs people out whenever the network hiccups.
      if (error) throw new Error(error.message ?? "Could not read the session.");
      return data ?? null;
    },
  });

  const notesQuery = useQuery({
    queryKey: ["notes"],
    queryFn: async () => {
      const client = await getAppClient();
      const page = await Effect.runPromise(client.notes.listNotes());
      // HttpApiClient decodes rows into NoteView class instances; keep the
      // query cache plain data, exactly like the web query does.
      return page.notes.map((note) => ({ ...note }));
    },
  });

  const form = useForm<NoteFormValues>({ resolver: standardSchemaResolver(noteFormSchema), defaultValues: { title: "", body: "" } });
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | undefined>();
  const [imageError, setImageError] = useState<string | undefined>();

  const createNote = useMutation({
    mutationFn: async (values: NoteFormValues) => {
      if (asset?.fileSize && asset.fileSize > MaxImageBytes) throw new Error(`Images are capped at ${MAX_IMAGE_MB} MB.`);
      const client = await getAppClient();
      // The multipart payload rides to the typed client as FormData: the
      // contract marks the payload as multipart, so the client encodes it.
      const formData = new FormData();
      formData.append("title", values.title.trim());
      formData.append("body", values.body);
      if (asset) {
        // Expo's fetch (the SDK's default global) only accepts string, Blob,
        // or a `bytes()`-capable File part; React Native's `{ uri, name,
        // type }` convention is rejected. expo-file-system's File is that
        // part, and it carries the picked file's own name and content type:
        // a filename argument here would be silently ignored, because the
        // FormData patch renames only real Blobs.
        formData.append("image", new File(asset.uri));
      }
      return Effect.runPromise(client.notes.createNote({ payload: formData }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      form.reset();
      setAsset(undefined);
      setImageError(undefined);
    },
  });

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      // iPhones shoot HEIC. The contract whitelists png/jpeg/webp/gif
      // because whatever R2 signs has to render in a browser, so ask the
      // picker for the compatible representation (transcodes to JPEG).
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled) return;
    const picked = result.assets[0];
    if (picked?.fileSize && picked.fileSize > MaxImageBytes) {
      setImageError(`Images are capped at ${MAX_IMAGE_MB} MB.`);
      return;
    }
    setImageError(undefined);
    setAsset(picked);
  };

  const signOut = async () => {
    try {
      await authClient.signOut();
    } catch {
      // The local session is cleared by the plugin either way; a failed
      // request should not trap the user on a signed-in screen.
    } finally {
      // The QueryClient lives for the process, not the session: without
      // clearing it, the next account on this device reads the previous
      // user's session and notes out of cache.
      queryClient.clear();
      router.replace("/sign-in");
    }
  };

  // A cached `null` while the mount refetch is still in flight is not a
  // verdict: without this, signing in within the cache window bounces the
  // user straight back to sign-in.
  if (sessionQuery.isPending || (sessionQuery.isFetching && !sessionQuery.data)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (sessionQuery.isError) {
    return (
      <View style={styles.center}>
        <ErrorText>{mutationErrorMessage(sessionQuery.error, "Could not reach the server.")}</ErrorText>
        <Button label="Retry" variant="secondary" onPress={() => sessionQuery.refetch()} />
      </View>
    );
  }
  if (!sessionQuery.data) return <Redirect href="/sign-in" />;

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={notesQuery.data ?? []}
      keyExtractor={(note) => note.id}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={notesQuery.isFetching} onRefresh={() => void notesQuery.refetch()} tintColor={colors.muted} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.topBar}>
            <Text style={styles.title}>One of everything</Text>
            <Button label="Sign out" variant="secondary" onPress={signOut} />
          </View>
          <MutedText>
            A note with an image, end to end: the row in D1, the file in a private bucket, the link signed for you alone. Every feature you add takes this shape.
          </MutedText>
          <Card>
            <Controller
              control={form.control}
              name="title"
              render={({ field, fieldState }) => (
                <TextField
                  label="Title"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  placeholder="Dinner plans"
                />
              )}
            />
            <Controller
              control={form.control}
              name="body"
              render={({ field, fieldState }) => (
                <TextField
                  label="Body"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  placeholder="Optional details"
                  multiline
                  numberOfLines={3}
                  style={styles.multiline}
                />
              )}
            />
            <Button label={asset ? "Replace image" : "Add image"} variant="secondary" onPress={pickImage} />
            {asset ? <MutedText>{`${asset.fileName ?? "image"} selected`}</MutedText> : null}
            {imageError ? <ErrorText>{imageError}</ErrorText> : null}
            <Button
              label={createNote.isPending ? "Adding..." : "Add note"}
              onPress={form.handleSubmit((values) => createNote.mutate(values))}
              disabled={createNote.isPending}
            />
            {createNote.isSuccess ? <MutedText>Note added.</MutedText> : null}
            {createNote.isError ? <ErrorText>{mutationErrorMessage(createNote.error, "Could not create the note.")}</ErrorText> : null}
          </Card>
        </View>
      }
      ListEmptyComponent={
        notesQuery.isPending ? (
          <ActivityIndicator style={styles.loading} />
        ) : notesQuery.isError ? (
          <ErrorText>{mutationErrorMessage(notesQuery.error, "Could not load your notes.")}</ErrorText>
        ) : (
          <MutedText>No notes yet. Add the first one above.</MutedText>
        )
      }
      renderItem={({ item }) => (
        <Card>
          <View style={styles.noteHeader}>
            <Text style={styles.noteTitle}>{item.title}</Text>
            <DeleteNoteButton id={item.id} />
          </View>
          {item.body ? <Text style={styles.noteBody}>{item.body}</Text> : null}
          {item.imageUrl ? <Image source={{ uri: resolveApiUrl(item.imageUrl) }} style={styles.noteImage} contentFit="cover" /> : null}
          {item.imageUrl ? <MutedText>This link is signed for you alone.</MutedText> : null}
          <MutedText>{new Date(item.createdAt).toLocaleString()}</MutedText>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
    padding: spacing.lg,
  },
  list: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingTop: spacing.xxl,
  },
  header: {
    gap: spacing.md,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  loading: {
    marginTop: spacing.lg,
  },
  noteHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  noteTitle: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "600",
  },
  noteBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  noteImage: {
    borderRadius: 10,
    height: 200,
    width: "100%",
  },
});

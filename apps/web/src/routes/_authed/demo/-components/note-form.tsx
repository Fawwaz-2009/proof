import { useMutation, useQueryClient } from "@tanstack/react-query";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { MaxImageBytes } from "@app/backend/contract";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAppClient, mutationErrorMessage } from "../../../../http-client";
import { notesQueryKey } from "../-queries";

// Validation placement: the same Schema library that types the wire contract
// validates the form on the client (Effect Schema speaks Standard Schema,
// which react-hook-form consumes directly). The server still validates
// everything again. The file input stays plain state: it is a binary
// side-input, not a validated text field, and the resolver earns its keep
// on the two fields a schema actually checks.
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

type Status = { kind: "ok" | "error"; text: string };

export function NoteForm() {
  const queryClient = useQueryClient();
  const form = useForm<NoteFormValues>({
    resolver: standardSchemaResolver(noteFormSchema),
    defaultValues: { title: "", body: "" },
  });
  const [image, setImage] = useState<File | undefined>();
  const [imageError, setImageError] = useState<string>();

  const createNote = useMutation({
    mutationFn: async (input: NoteFormValues & { image?: File }) => {
      const client = await getAppClient();
      // The multipart payload rides to the typed client as FormData: the
      // contract marks the payload as multipart, so the client encodes it.
      const formData = new FormData();
      formData.append("title", input.title.trim());
      formData.append("body", input.body);
      if (input.image) formData.append("image", input.image);
      return Effect.runPromise(client.notes.createNote({ payload: formData }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesQueryKey });
      form.reset();
      setImage(undefined);
    },
  });

  // Server feedback derives from the mutation state: no hand-rolled status
  // to keep in sync, and a pending retry clears the old message for free.
  const status: Status | undefined = createNote.isSuccess
    ? { kind: "ok", text: "Note added." }
    : createNote.isError
      ? { kind: "error", text: mutationErrorMessage(createNote.error, "Could not create the note.") }
      : undefined;

  const submit = (values: NoteFormValues) => {
    // Client-side guard is instant UX feedback; the server's multipart
    // parser remains the backstop (its 413 arrives as a defect).
    if (image && image.size > MaxImageBytes) {
      setImageError(`Images are capped at ${Math.round(MaxImageBytes / (1024 * 1024))} MB.`);
      return;
    }
    setImageError(undefined);
    createNote.mutate({ ...values, image });
  };

  return (
    <Card className="mt-8">
      <CardContent>
        <form onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" {...form.register("title")} aria-invalid={Boolean(form.formState.errors.title)} placeholder="What is this note about?" autoComplete="off" />
            {form.formState.errors.title ? (
              <p className="text-sm text-destructive" role="alert">
                {form.formState.errors.title.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="body">Body</Label>
            <Textarea id="body" {...form.register("body")} placeholder="Optional details" rows={3} />
            {form.formState.errors.body ? (
              <p className="text-sm text-destructive" role="alert">
                {form.formState.errors.body.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="image">Image (optional)</Label>
            <input
              id="image"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => setImage(event.target.files?.[0] ?? undefined)}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
            />
            {imageError ? (
              <p className="text-sm text-destructive" role="alert">
                {imageError}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={createNote.isPending}>
              {createNote.isPending ? "Working..." : "Add note"}
            </Button>
            {status ? <p className={status.kind === "ok" ? "text-sm text-emerald-600 dark:text-emerald-400" : "text-sm text-destructive"}>{status.text}</p> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

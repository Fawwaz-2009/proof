import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as Effect from "effect/Effect";
import { MaxImageBytes } from "@starting-flare/backend/contract";
import { getAppClient, mutationErrorMessage } from "../../http-client";
import { notesQueryKey, notesQueryOptions } from "./demo/-queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "@tanstack/react-form";
import * as z from "zod";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/demo")({
  // Server-rendered cold loads prefetch here (binding transport, cookies forwarded);
  // the result dehydrates into the HTML, so useSuspenseQuery never refetches.
  // (ensureQueryData is deprecated in query-core 5.102; query + staleTime 'static'
  // is its replacement: use cached data when present, fetch when missing.)
  loader: ({ context }) => context.queryClient.query({ ...notesQueryOptions(), staleTime: "static" }),
  component: Demo,
  errorComponent: DemoError,
});

const noteFormSchema = z.object({
  title: z.string().min(1, "Give the note a title.").max(200, "Title must be at most 200 characters."),
  body: z.string().max(10_000, "Body must be at most 10,000 characters."),
});

function Demo() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(notesQueryOptions());
  const [image, setImage] = useState<File | undefined>();

  const createNote = useMutation({
    mutationFn: async (input: { title: string; body: string; image?: File }) => {
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
      toast.success("Note added.");
    },
    onError: (error) => toast.error(mutationErrorMessage(error, "Could not create the note.")),
  });

  const destroyNote = useMutation({
    mutationFn: async (id: string) => {
      const client = await getAppClient();
      return Effect.runPromise(client.notes.destroyNote({ params: { id } }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notesQueryKey }),
    onError: (error) => toast.error(mutationErrorMessage(error, "Could not delete the note.")),
  });

  const form = useForm({
    defaultValues: {
      title: "",
      body: "",
    },
    validators: {
      onSubmit: noteFormSchema,
    },
    onSubmit: async ({ value }) => {
      // Client-side guard is instant UX feedback; the server's multipart
      // parser remains the backstop (its 413 arrives as a defect).
      if (image && image.size > MaxImageBytes) {
        toast.error(`Images are capped at ${Math.round(MaxImageBytes / (1024 * 1024))} MB.`);
        return;
      }
      createNote.mutate({ title: value.title, body: value.body, image });
    },
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">Notes</h1>
      <p className="mt-1 text-muted-foreground">A vertical slice: rows in D1, images in a private R2 bucket, every endpoint owner-scoped.</p>

      <Card className="mt-8">
        <CardContent>
          <form
            id="note-form"
            onSubmit={(event) => {
              event.preventDefault();
              form.handleSubmit();
            }}
          >
            <FieldGroup>
              <form.Field
                name="title"
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Title</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        aria-invalid={isInvalid}
                        placeholder="What is this note about?"
                        autoComplete="off"
                      />
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </Field>
                  );
                }}
              />
              <form.Field
                name="body"
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Body</FieldLabel>
                      <Textarea
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        aria-invalid={isInvalid}
                        placeholder="Optional details"
                        rows={3}
                      />
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </Field>
                  );
                }}
              />
              <Field>
                <FieldLabel htmlFor="image">Image (optional)</FieldLabel>
                <Input id="image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => setImage(event.target.files?.[0] ?? undefined)} />
              </Field>
            </FieldGroup>
            <Button className="mt-4" type="submit" form="note-form" disabled={createNote.isPending}>
              {createNote.isPending ? "Working..." : "Add note"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {data.notes.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No notes yet. Add the first one above.</p> : null}

      <ul className="mt-6 flex flex-col gap-4">
        {data.notes.map((note) => (
          <li key={note.id}>
            <Card>
              <CardContent>
                <div className="flex items-center justify-between gap-4">
                  <strong>{note.title}</strong>
                  <Button variant="outline" size="sm" disabled={destroyNote.isPending} onClick={() => destroyNote.mutate(note.id)}>
                    {destroyNote.isPending && destroyNote.variables === note.id ? "Deleting..." : "Delete"}
                  </Button>
                </div>
                {note.body ? <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{note.body}</p> : null}
                {note.imageUrl ? <img src={note.imageUrl} alt={note.title} className="mt-3 max-h-64 rounded-md border" /> : null}
                <footer className="mt-4 flex items-center justify-between gap-4 border-t pt-3">
                  <span className="text-sm text-muted-foreground">{new Date(note.createdAt).toLocaleString()}</span>
                </footer>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}

function DemoError() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-3xl font-bold">Could not load your notes.</h1>
      <p className="mt-2 text-muted-foreground">Check your connection and try again.</p>
      <a className="mt-6 inline-block rounded-lg border bg-card px-4 py-2 font-semibold hover:bg-accent hover:text-accent-foreground" href="/demo">
        Retry
      </a>
    </main>
  );
}

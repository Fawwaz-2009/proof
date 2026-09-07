import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { MaxImageBytes } from "@sufra/backend/contract";
import { AppClient, createNoteAtom, destroyNoteAtom, mutationErrorMessage } from "../../http-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "@tanstack/react-form";
import * as z from "zod";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/demo")({
  component: Demo,
});

const noteFormSchema = z.object({
  title: z.string().min(1, "Give the note a title.").max(200, "Title must be at most 200 characters."),
  body: z.string().max(10_000, "Body must be at most 10,000 characters."),
});

function Demo() {
  const notes = useAtomValue(AppClient.query("notes", "listNotes", { reactivityKeys: ["notes"] }));
  const createResult = useAtomValue(createNoteAtom);
  const createNote = useAtomSet(createNoteAtom, { mode: "promiseExit" });
  const destroyNote = useAtomSet(destroyNoteAtom, { mode: "promiseExit" });
  const [image, setImage] = useState<File | undefined>();

  const creating = AsyncResult.isWaiting(createResult);

  const data = AsyncResult.isSuccess(notes) ? notes.value : undefined;
  const loading = AsyncResult.isInitial(notes);
  // A Failure only surfaces as user-facing copy when it carries a real typed
  // error; dev-mode interrupts/HMR aborts arrive as `Die` defects and are noise.
  const loadFailed = AsyncResult.isFailure(notes) && Option.isSome(Cause.findErrorOption(notes.cause));

  const form = useForm({
    defaultValues: {
      title: "",
      body: "",
    },
    validators: {
      onSubmit: noteFormSchema,
    },
    onSubmit: async ({ value }) => {
      if (image && image.size > MaxImageBytes) {
        toast.error(`Images are capped at ${Math.round(MaxImageBytes / (1024 * 1024))} MB.`);
        return;
      }

      // The multipart payload rides to the typed client as FormData: the
      // contract marks the payload as multipart, so the client encodes it.
      const formData = new FormData();
      formData.append("title", value.title.trim());
      formData.append("body", value.body);
      if (image) formData.append("image", image);

      Exit.match(await createNote({ payload: formData, reactivityKeys: ["notes"] }), {
        onSuccess: () => {
          form.reset();
          setImage(undefined);
          toast.success("Note added.");
        },
        onFailure: (cause) => toast.error(mutationErrorMessage(Cause.findErrorOption(cause), "Could not create the note.")),
      });
    },
  });

  const removeNote = async (id: string) => {
    Exit.match(await destroyNote({ params: { id }, reactivityKeys: ["notes"] }), {
      onSuccess: () => {},
      onFailure: (cause) => toast.error(mutationErrorMessage(Cause.findErrorOption(cause), "Could not delete the note.")),
    });
  };

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
                <Input
                  id="image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => setImage(event.target.files?.[0] ?? undefined)}
                />
              </Field>
            </FieldGroup>
            <Button className="mt-4" type="submit" form="note-form" disabled={creating}>
              {creating ? "Working..." : "Add note"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {loadFailed ? <p className="mt-4 text-sm text-destructive">Could not load your notes.</p> : null}
      {loading ? <p className="mt-4 text-sm text-muted-foreground">Loading notes...</p> : null}
      {data && data.notes.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No notes yet. Add the first one above.</p> : null}

      <ul className="mt-6 flex flex-col gap-4">
        {data?.notes.map((note) => (
          <li key={note.id}>
            <Card>
              <CardContent>
                <div className="flex items-center justify-between gap-4">
                  <strong>{note.title}</strong>
                  <Button variant="outline" size="sm" onClick={() => removeNote(note.id)}>
                    Delete
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

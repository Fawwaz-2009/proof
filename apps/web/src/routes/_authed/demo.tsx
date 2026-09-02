import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { AttachmentMaxBytes } from "@sufra/backend/contract";
import { AppClient, createNoteAtom, destroyNoteAtom, getAttachment, putAttachmentAtom } from "../../http-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "@tanstack/react-form";
import * as z from "zod";

export const Route = createFileRoute("/_authed/demo")({
  component: Demo,
});

const noteFormSchema = z.object({
  title: z.string().min(1, "Give the note a title.").max(200, "Title must be at most 200 characters."),
  body: z.string().max(10_000, "Body must be at most 10,000 characters."),
});

const decodeBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  }).then((dataUrl) => dataUrl.slice(dataUrl.indexOf(",") + 1));

function Demo() {
  const notes = useAtomValue(AppClient.query("notes", "listNotes", { reactivityKeys: ["notes"] }));
  const createNote = useAtomSet(createNoteAtom, { mode: "promise" });
  const destroyNote = useAtomSet(destroyNoteAtom, { mode: "promise" });
  const putAttachment = useAtomSet(putAttachmentAtom, { mode: "promise" });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const fileInputs = useRef(new Map<string, HTMLInputElement>());

  const data = AsyncResult.isSuccess(notes) ? notes.value : undefined;
  const loading = AsyncResult.isWaiting(notes);

  const form = useForm({
    defaultValues: {
      title: "",
      body: "",
    },
    validators: {
      onSubmit: noteFormSchema,
    },
    onSubmit: async ({ value }) => {
      setBusy(true);
      setError(undefined);
      try {
        await createNote({ payload: { title: value.title.trim(), body: value.body }, reactivityKeys: ["notes"] });
        form.reset();
      } catch {
        setError("Could not create the note.");
      } finally {
        setBusy(false);
      }
    },
  });

  const removeNote = async (id: string) => {
    setError(undefined);
    try {
      await destroyNote({ params: { id }, reactivityKeys: ["notes"] });
    } catch {
      setError("Could not delete the note.");
    }
  };

  const uploadAttachment = async (id: string) => {
    const input = fileInputs.current.get(id);
    const file = input?.files?.[0];
    if (!file) return;
    if (file.size > AttachmentMaxBytes) {
      setError(`Files are capped at ${Math.round(AttachmentMaxBytes / (1024 * 1024))} MB.`);
      input.value = "";
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const base64 = await fileToBase64(file);
      await putAttachment({
        params: { id },
        payload: { name: file.name, contentType: file.type || "application/octet-stream", data: base64 },
        reactivityKeys: ["notes"],
      });
    } catch {
      setError("Could not upload the attachment.");
    } finally {
      setBusy(false);
      if (input) input.value = "";
    }
  };

  const downloadAttachment = async (id: string, name: string | null) => {
    setError(undefined);
    try {
      const attachment = await getAttachment(id);
      const blob = new Blob([decodeBase64(attachment.data).buffer as ArrayBuffer], { type: attachment.contentType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name ?? attachment.name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download the attachment.");
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">Notes</h1>
      <p className="mt-1 text-muted-foreground">A vertical slice: rows in D1, attachment bytes in a private R2 bucket, every endpoint owner-scoped.</p>

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
            </FieldGroup>
            <Button className="mt-4" type="submit" form="note-form" disabled={busy}>
              {busy ? "Working..." : "Add note"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
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
                <footer className="mt-4 flex items-center justify-between gap-4 border-t pt-3">
                  <span className="text-sm text-muted-foreground">{new Date(note.createdAt).toLocaleString()}</span>
                  <div className="flex items-center gap-3">
                    {note.hasAttachment ? (
                      <Button variant="outline" size="sm" onClick={() => downloadAttachment(note.id, note.attachmentName)}>
                        Download {note.attachmentName ?? "attachment"}
                      </Button>
                    ) : null}
                    <Input
                      className="w-auto"
                      type="file"
                      onChange={(event) => {
                        const input = event.target;
                        uploadAttachment(note.id);
                        input.value = "";
                      }}
                      ref={(element) => {
                        if (element) fileInputs.current.set(note.id, element);
                        else fileInputs.current.delete(note.id);
                      }}
                    />
                  </div>
                </footer>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}

import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { AttachmentMaxBytes } from "@sufra/backend/contract";
import { AppClient, createNoteAtom, destroyNoteAtom, getAttachment, putAttachmentAtom } from "../../http-client";

export const Route = createFileRoute("/_authed/demo")({
  component: Demo,
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
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const fileInputs = useRef(new Map<string, HTMLInputElement>());

  const data = AsyncResult.isSuccess(notes) ? notes.value : undefined;
  const loading = AsyncResult.isWaiting(notes);

  useEffect(() => {
    if (AsyncResult.isFailure(notes)) {
      setError("Could not load your notes.");
    }
  }, [notes]);

  const submitNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      await createNote({ payload: { title: title.trim(), body }, reactivityKeys: ["notes"] });
      setTitle("");
      setBody("");
    } catch {
      setError("Could not create the note.");
    } finally {
      setBusy(false);
    }
  };

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
    <main className="page">
      <h1>Notes</h1>
      <p className="page-copy">A vertical slice: rows in D1, attachment bytes in a private R2 bucket, every endpoint owner-scoped.</p>

      <form className="note-form card" onSubmit={submitNote}>
        <label htmlFor="title">Title</label>
        <input id="title" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What is this note about?" />
        <label htmlFor="body">Body</label>
        <textarea id="body" rows={3} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Optional details" />
        <button className="button primary" type="submit" disabled={busy}>
          Add note
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="hint">Loading notes...</p> : null}
      {data && data.notes.length === 0 ? <p className="hint">No notes yet. Add the first one above.</p> : null}

      <ul className="note-list">
        {data?.notes.map((note) => (
          <li key={note.id} className="card note">
            <div className="note-head">
              <strong>{note.title}</strong>
              <button className="button small" type="button" onClick={() => removeNote(note.id)}>
                Delete
              </button>
            </div>
            {note.body ? <p className="note-body">{note.body}</p> : null}
            <footer className="note-foot">
              <span className="hint">{new Date(note.createdAt).toLocaleString()}</span>
              <div className="note-actions">
                {note.hasAttachment ? (
                  <button className="button small" type="button" onClick={() => downloadAttachment(note.id, note.attachmentName)}>
                    Download {note.attachmentName ?? "attachment"}
                  </button>
                ) : null}
                <input
                  ref={(element) => {
                    if (element) fileInputs.current.set(note.id, element);
                    else fileInputs.current.delete(note.id);
                  }}
                  type="file"
                  onChange={() => uploadAttachment(note.id)}
                />
              </div>
            </footer>
          </li>
        ))}
      </ul>
    </main>
  );
}

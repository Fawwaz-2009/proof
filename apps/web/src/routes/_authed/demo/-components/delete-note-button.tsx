import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as Effect from "effect/Effect";
import { Button } from "@/components/ui/button";
import { getAppClient, mutationErrorMessage } from "../../../../http-client";
import { notesQueryKey } from "../-queries";

// Each button owns its mutation, so pending state is naturally per note:
// no shared "which id is deleting" bookkeeping, and a failure renders
// beside the button that caused it.
export function DeleteNoteButton({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();

  const destroyNote = useMutation({
    mutationFn: async () => {
      const client = await getAppClient();
      return Effect.runPromise(client.notes.destroyNote({ params: { id } }));
    },
    onSuccess: () => {
      setError(undefined);
      queryClient.invalidateQueries({ queryKey: notesQueryKey });
    },
    onError: (mutationError) => setError(mutationErrorMessage(mutationError, "Could not delete the note.")),
  });

  return (
    <span className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" disabled={destroyNote.isPending} onClick={() => destroyNote.mutate()}>
        {destroyNote.isPending ? "Deleting..." : "Delete"}
      </Button>
      {error ? (
        <p className="max-w-48 text-right text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </span>
  );
}

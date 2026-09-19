import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as Effect from "effect/Effect";
import { ErrorText } from "@/components/ui";
import { Button } from "@/components/ui";
import { getAppClient, mutationErrorMessage } from "@/lib/api-client";

/** The small case: a mutation and its error display beside two lines of UI. */
export function DeleteNoteButton({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const destroyNote = useMutation({
    mutationFn: async () => {
      const client = await getAppClient();
      await Effect.runPromise(client.notes.destroyNote({ params: { id } }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes"] }),
  });

  return (
    <>
      <Button
        label={destroyNote.isPending ? "Deleting..." : confirming ? "Confirm" : "Delete"}
        variant="danger"
        onPress={() => (confirming ? destroyNote.mutate() : setConfirming(true))}
        disabled={destroyNote.isPending}
      />
      {destroyNote.isError ? <ErrorText>{mutationErrorMessage(destroyNote.error, "Could not delete the note.")}</ErrorText> : null}
    </>
  );
}

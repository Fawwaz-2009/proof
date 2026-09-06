/**
 * The API surface as one merged layer: every contract group AppApi serves,
 * ready to provide into the router. Group layers close over their services
 * at build; request-scoped requirements stay with the handler effects.
 */
import * as Layer from "effect/Layer";
import { notesHandlers } from "./notes.ts";

export const ApiHandlers = notesHandlers;

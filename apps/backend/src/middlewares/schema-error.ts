import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpApiError, HttpApiMiddleware } from "effect/unstable/httpapi";
import { SchemaErrorHandler, ValidationError } from "../contracts/notes.ts";

/**
 * Translates schema-decode failures (payload shape, size limits, content-type
 * filters) into a typed 400 `ValidationError` carrying the checker's message,
 * instead of an opaque defect. Wire alongside the other discharge-edge layers.
 */
export const SchemaErrorHandlerLive = HttpApiMiddleware.layerSchemaErrorTransform(
  SchemaErrorHandler,
  (schemaError: HttpApiError.HttpApiSchemaError) =>
    Effect.fail(
      new ValidationError({
        message: schemaError.cause.message || "The request payload is invalid.",
      }),
    ),
);

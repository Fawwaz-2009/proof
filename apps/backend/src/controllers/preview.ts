import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { AppApi } from "../contracts/index.ts";
import { PreviewStatus } from "../domain/preview.ts";

/**
 * The preview controller: yields the status service and answers with the
 * deployment's own record. No payload, no parameters: accepting a caller-named
 * key or stage is exactly the surface this must not have.
 */
export const previewHandlers = HttpApiBuilder.group(AppApi, "preview", (handlers) =>
  Effect.gen(function* () {
    const status = yield* PreviewStatus;
    return handlers.handleAll({
      getMobilePreviewStatus: () => status.read(),
    });
  }),
);

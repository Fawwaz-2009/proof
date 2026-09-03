import * as Schema from "effect/Schema";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

export class SendEmailRequest extends Schema.Class<SendEmailRequest>("SendEmailRequest")({
  to: Schema.String,
  subject: Schema.String,
  text: Schema.optional(Schema.String),
}) {}

export class SendEmailResponse extends Schema.Class<SendEmailResponse>("SendEmailResponse")({
  /** "sent" = delivered through the send_email binding; "captured" = dev sink. */
  status: Schema.Literals(["sent", "captured"]),
}) {}

export const GetEnvironment = HttpApiEndpoint.get("getEnvironment", "/environment", {
  success: Schema.Struct({ environment: Schema.Literals(["local", "preview", "prod"]) }),
});

export const SendEmailEndpoint = HttpApiEndpoint.post("sendEmail", "/email", {
  payload: SendEmailRequest,
  success: SendEmailResponse,
});

export const TempEndpoints = HttpApiGroup.make("temp").add(GetEnvironment, SendEmailEndpoint);
export class TempApi extends HttpApi.make("temp").add(TempEndpoints).prefix("/api") {}

import * as Schema from "effect/Schema";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

// — Probes: endpoints that only exercise the services. —

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

// — Domain: sign-in codes. —

export class SignInCodeView extends Schema.Class<SignInCodeView>("SignInCodeView")({
  email: Schema.String,
  code: Schema.String,
}) {}

export class SignInCodeNotFound extends Schema.TaggedError<SignInCodeNotFound>()(
  "SignInCodeNotFound",
  { email: Schema.String },
  { httpApiStatus: 404 },
) {}

export const IssueSignInCode = HttpApiEndpoint.post("issueSignInCode", "/sign-in-codes", {
  payload: Schema.Struct({ email: Schema.String }),
  success: SignInCodeView,
});

export const GetLatestSignInCode = HttpApiEndpoint.get("getLatestSignInCode", "/sign-in-codes/:email", {
  params: { email: Schema.String },
  success: SignInCodeView,
  error: SignInCodeNotFound,
});

export const SignInCodesEndpoints = HttpApiGroup.make("sign-in-codes").add(IssueSignInCode, GetLatestSignInCode);

// The sign-in-codes group returns with the drizzle-handle slice:
// export class TempApi extends HttpApi.make("temp").add(TempEndpoints, SignInCodesEndpoints).prefix("/api") {}
export class TempApi extends HttpApi.make("temp").add(TempEndpoints, SignInCodesEndpoints).prefix("/api") {}

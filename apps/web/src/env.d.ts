declare module "cloudflare:workers" {
  export const env: {
    readonly BACKEND: { fetch(request: Request): Promise<Response> };
    readonly STAGE: string;
    readonly APP_NAME: string;
  };
}

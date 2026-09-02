declare module "cloudflare:workers" {
  export const env: {
    readonly BACKEND: { fetch(request: Request): Promise<Response> };
  };
}

import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * App-wide toast outlet. Mounted once in `__root`; trigger toasts anywhere
 * with `toast.success(...)` / `toast.error(...)` from `sonner`.
 */
function Toaster(props: ToasterProps) {
  return <Sonner richColors closeButton position="bottom-right" {...props} />;
}

export { Toaster };

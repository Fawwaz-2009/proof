import type { ReactNode } from "react";

// The square mono label every section opens with: the page's wayfinding
// signature, in ink like the reference's chips.
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center self-start border border-border bg-background px-3 py-1.5 font-mono text-sm uppercase leading-[18px] tracking-[0.2em] text-muted-foreground">
      {children}
    </span>
  );
}

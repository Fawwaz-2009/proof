import type { ReactNode } from "react";
import { Activity, Bot, Braces, Eye, Gauge, GitMerge, KeyRound, Mail, TextCursorInput } from "lucide-react";
import { Chip } from "./chip";

// The reference overview grid, from its code: white cells on a micro-dot
// field, dots in the frame padding, and the accent as a HOVER state only
// (cell flips to primary, the dot band behind the icon lights up). Icons
// sit in a layered chip: 48px dotted square, white 28px square, glyph.
const cell =
  "group flex min-w-0 flex-col gap-12 bg-background p-8 transition-colors duration-200 hover:bg-primary hover:text-primary-foreground sm:p-[31.2px] lg:min-h-72";

function FeatureCell({ icon: Icon, title, children }: { icon: typeof Braces; title: string; children: ReactNode }) {
  return (
    <div className={cell}>
      <div className="relative flex h-12 items-center lg:mb-12">
        <div className="relative flex size-12 items-center justify-center bg-micro-dots bg-center text-zinc-800 transition-colors duration-200 group-hover:text-primary-foreground dark:text-zinc-50 dark:group-hover:text-primary-foreground">
          <span className="flex size-7 items-center justify-center bg-background text-zinc-800 dark:text-zinc-50">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-balance font-medium text-xl leading-8">{title}</h3>
        <p className="text-[15px] leading-7 text-zinc-600 transition-colors duration-200 group-hover:text-primary-foreground/80 dark:text-zinc-400">{children}</p>
      </div>
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 border-t border-zinc-200 dark:border-zinc-800">
      <div className="shell py-20 sm:py-24">
        <Chip>Features</Chip>
        <h2 className="mt-6 max-w-2xl text-4xl font-normal leading-tight tracking-[-0.24px] text-foreground lg:text-5xl">What you get.</h2>
        <p className="mt-4 max-w-xl text-lg leading-7 text-muted-foreground">
          Every feature here is small, real, and in the repo. Nothing on this page is a mock of something the template does not do.
        </p>
        <div className="mt-12 bg-micro-dots p-2 text-zinc-800 lg:p-[42px] dark:text-zinc-50">
          <div className="grid gap-2 lg:grid-cols-3 lg:gap-0">
            <FeatureCell icon={Braces} title="End-to-end type safety">
              One shared contract types the API, the browser client, and the forms. No hand-written URLs, no response decoding: a backend change that breaks a page breaks
              the build.
            </FeatureCell>
            <FeatureCell icon={Eye} title="Views, not raw endpoints">
              A pure function projects each row into the exact shape the browser needs, signed links included, in the one place that authorizes. Storage keys never leave
              the backend.
            </FeatureCell>
            <FeatureCell icon={KeyRound} title="Passwordless out of the box">
              Better Auth email codes: hashed at rest, rate-limited in the database, gated at SSR. Previews capture the code in logs, so testing never sends mail.
            </FeatureCell>
            <FeatureCell icon={Mail} title="Cloudflare Email">
              Real delivery in production through the send_email binding, from your own domain. Captured to logs everywhere else, and a failed send never breaks the
              request.
            </FeatureCell>
            <FeatureCell icon={GitMerge} title="Merge is production">
              Migrations ride the deploy. A readiness gate keeps the merge red until the setup checklist is whole, and the preview stage is destroyed the moment main
              moves.
            </FeatureCell>
            <FeatureCell icon={Activity} title="Observability included">
              Cloudflare logs and tracing on both Workers, wired before you write a line. Follow a stage live from your terminal while an agent works.
            </FeatureCell>
            <FeatureCell icon={Gauge} title="Fast where it counts">
              This page renders on the edge with almost no client JavaScript. The backend has no servers to wake: Workers, D1, and R2 answer from the first byte.
            </FeatureCell>
            <FeatureCell icon={TextCursorInput} title="One schema, both ends">
              Effect Schema validates the payload on the wire and the form in the browser, through React Hook Form. The error your user sees is the error the contract
              declares.
            </FeatureCell>
            <FeatureCell icon={Bot} title="Built for agents">
              Worktrees per issue, hashed ports, an AGENTS.md that carries the proof brief. Parallel agents never share a checkout, and every issue ends in a proof.
            </FeatureCell>
          </div>
        </div>
      </div>
    </section>
  );
}

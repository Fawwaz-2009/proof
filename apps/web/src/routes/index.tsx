import { createFileRoute } from "@tanstack/react-router";
import { BuiltWith } from "./-components/built-with";
import { Faq } from "./-components/faq";
import { Features } from "./-components/features";
import { Footer } from "./-components/footer";
import { GettingStarted } from "./-components/getting-started";
import { Hero } from "./-components/hero";
import { Nav } from "./-components/nav";
import { What } from "./-components/what";

export const Route = createFileRoute("/")({
  component: Storefront,
  head: () => ({
    meta: [
      {
        name: "description",
        content:
          "Proof is a starter with a pipeline: an agent builds each issue in isolation, every pull request ships with a running proof on your own domain, and merge ships it.",
      },
    ],
  }),
});

// The stage strip only speaks on preview deploys of this repository: the
// prod deploy is the product page, and it never calls itself a preview.
const isPreview = (stage: string) => stage.startsWith("pr-");

function Storefront() {
  const { stage } = Route.useLoaderData() ?? { stage: "" };

  return (
    <div className="min-h-svh">
      {isPreview(stage) ? (
        <div className="border-b border-primary/20 bg-primary/5 px-6 py-1.5 text-center text-xs font-semibold tracking-wide text-primary">
          PROOF &middot; {stage.toUpperCase()} &middot; DESTROYED ON MERGE
        </div>
      ) : null}
      <Nav />
      <main>
        <Hero />
        <What />
        <BuiltWith />
        <Features />
        <GettingStarted />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}

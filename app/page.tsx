import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { HomeAuthButton } from "@/components/HomeAuthButton";
import { Logo } from "@/components/Logo";
import { PublicToolList } from "@/components/PublicToolList";

// Rendered per request so the list is fresh and the build never needs a live backend.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Server-side render of the public list (name and category only), kept live on the client.
  const tools = await preloadQuery(api.tools.listPublic, {});

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <Logo />
        <HomeAuthButton compact />
      </header>

      <main className="flex-1">
        <section className="py-14 sm:py-20">
          <p className="mb-3 text-sm font-medium text-brand">A tool-lending board for your neighborhood</p>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Borrow what you need. Lend what you don&apos;t.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            List the drill that sits in your garage, borrow a ladder for the weekend, and let LendLoop send the
            notifications and return reminders.
          </p>
          <div className="mt-8">
            <HomeAuthButton />
          </div>
        </section>

        <section aria-labelledby="available-heading" className="pb-16">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 id="available-heading" className="text-lg font-semibold">
              Available right now
            </h2>
            <p className="text-sm text-muted">Sign in to see details and request one.</p>
          </div>
          <PublicToolList preloaded={tools} />
        </section>
      </main>

      <footer className="border-t border-line py-6 text-sm text-muted">LendLoop is a demo project.</footer>
    </div>
  );
}

import type { Metadata } from "next";
import { SignInPanel } from "@/features/auth/sign-in-panel";
import { safeNext } from "@/lib/auth/safe-next";

export const metadata: Metadata = { title: "Sign in" };

/**
 * The one sign-in surface for both an official (arriving via `?next=/admin…`)
 * and a resident linking an anonymous history to a real account. `next` is
 * reduced through `safeNext` here, server-side, before the client panel ever
 * sees it — the same guard the callback and confirm routes apply on the way
 * back.
 */
export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeNext(rawNext);
  const notice = typeof params.notice === "string" ? params.notice : undefined;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4 sm:p-6 lg:p-8">
      <SignInPanel next={next} notice={notice} />
    </main>
  );
}

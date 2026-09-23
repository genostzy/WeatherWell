import { SharedAlertView } from "./shared-alert-view";

/**
 * A forwarded alert. Read from ?d= on the server (idea 6), so the whole alert
 * is in the HTML: it reads with JavaScript off, in Facebook's free-data mode,
 * and on the cheapest phones. Older #... links still render on the client.
 */
export default async function SharedAlertPage({ searchParams }: PageProps<"/a">) {
  const params = await searchParams;
  const d = Array.isArray(params.d) ? params.d[0] : params.d;
  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-4 sm:p-6">
      <SharedAlertView initialPayload={d ?? ""} />
    </main>
  );
}

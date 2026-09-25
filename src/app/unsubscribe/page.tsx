import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Where an email's "stop these emails" link lands. Asks before doing
 * anything: the link itself only opens this page (see the unsubscribe
 * route). Rendered on the server with no language setting to read, so it
 * says everything in both languages.
 */
export default async function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  const params = await searchParams;
  const done = params.done === "1";
  const token = typeof params.token === "string" ? params.token : null;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4 sm:p-6 lg:p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-lg">WeatherWell emails</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {done ? (
            <>
              <p role="status">You won&apos;t get WeatherWell emails any more.</p>
              <p lang="fil">Hindi ka na makakatanggap ng mga email ng WeatherWell.</p>
            </>
          ) : token ? (
            <form method="post" action={`/api/email/unsubscribe?token=${encodeURIComponent(token)}`} className="space-y-3">
              <p>Stop WeatherWell&apos;s flood-alert emails to this address?</p>
              <p lang="fil">Itigil ang mga email ng WeatherWell tungkol sa baha sa address na ito?</p>
              <Button type="submit" size="lg" className="w-full">
                Stop emails / Itigil ang mga email
              </Button>
            </form>
          ) : (
            <>
              <p>This link is incomplete. Open the link in the email again.</p>
              <p lang="fil">Kulang ang link na ito. Buksan muli ang link sa email.</p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

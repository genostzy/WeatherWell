/**
 * Used by .github/workflows/monitor.yml. A non-zero exit fails the scheduled
 * run, and GitHub emails the repository owner — that email is the alert.
 * Prints which check failed and a count; never an error's contents.
 */
export async function checkHealth({ healthUrl, homeUrl, fetchImpl = fetch, retryDelayMs = 30_000 }) {
  const lines = [];
  let ok = true;

  async function getHealth() {
    try {
      const res = await fetchImpl(healthUrl, { cache: "no-store" });
      if (res.status !== 200) return { failure: `health check failed: HTTP ${res.status}` };
      const body = await res.json();
      return { recentErrors: Number(body.recentErrors) || 0 };
    } catch {
      return { failure: "health check failed: unreachable" };
    }
  }

  let health = await getHealth();
  if (health.failure) {
    await new Promise((r) => setTimeout(r, retryDelayMs));
    health = await getHealth();
  }
  if (health.failure) {
    ok = false;
    lines.push(health.failure);
  } else if (health.recentErrors > 0) {
    ok = false;
    lines.push(`new crashes in the last 15 minutes: ${health.recentErrors}`);
  } else {
    lines.push("health ok");
  }

  try {
    const home = await fetchImpl(homeUrl, { cache: "no-store" });
    if (home.status !== 200) {
      ok = false;
      lines.push(`production homepage failed: HTTP ${home.status}`);
    } else {
      lines.push("production homepage ok");
    }
  } catch {
    ok = false;
    lines.push("production homepage failed: unreachable");
  }

  return { ok, lines };
}

if (
  process.env.VITEST !== "true" &&
  (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("check-health.mjs"))
) {
  const { ok, lines } = await checkHealth({ healthUrl: process.env.HEALTH_URL, homeUrl: process.env.HOME_URL });
  for (const line of lines) console.log(line);
  process.exit(ok ? 0 : 1);
}

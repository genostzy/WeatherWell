import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";

// Both actions are "use server" modules reached only through a dynamic
// import inside the page's change handlers (see the comment above those
// handlers) — mocked here so rendering the page never touches them.
const setZoneAlertMock = vi.fn().mockResolvedValue({ ok: true });
const setCenterStatusMock = vi.fn().mockResolvedValue({ ok: true });

vi.mock("@/app/actions/set-zone-alert", () => ({
  setZoneAlert: (...args: unknown[]) => setZoneAlertMock(...args),
}));
vi.mock("@/app/actions/set-center", () => ({
  setCenterStatus: (...args: unknown[]) => setCenterStatusMock(...args),
}));

import ZoneDashboardPage from "./page";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

/**
 * The page reads its route param via React's `use(params)`, which suspends
 * on a plain pending promise until the Scheduler pings the root — a real
 * mechanism, but one that never fires in this jsdom test environment (no
 * task-queue driver `act()` can flush). Next.js itself sidesteps this for
 * already-known params by handing `use()` a thenable that already carries
 * `status: "fulfilled"` and `value`, which `use()` special-cases to return
 * synchronously without suspending at all. Same trick here.
 */
function resolvedParams<T>(value: T): Promise<T> {
  const thenable = Promise.resolve(value) as Promise<T> & { status?: string; value?: T };
  thenable.status = "fulfilled";
  thenable.value = value;
  return thenable;
}

// The page never reads searchParams; a resolved-empty thenable via the same
// helper satisfies PageProps's required shape without adding behavior.
const emptySearchParams = resolvedParams({});

describe("ZoneDashboardPage capacity control", () => {
  it("disables the capacity select once a headcount is tracked, so the operator can't pick a status the headcount would immediately overrule", () => {
    const zone = { ...FIXTURE_REFERENCE_DATA.zones[0], currentOccupancy: 285 };
    renderWithData(<ZoneDashboardPage params={resolvedParams({ zoneId: zone.id })} searchParams={emptySearchParams} />, {
      data: { zones: [zone, ...FIXTURE_REFERENCE_DATA.zones.slice(1)] },
    });

    expect(screen.getByLabelText(/evacuation center capacity/i)).toBeDisabled();
    expect(screen.getByText(/entering a headcount derives the status automatically/i)).toBeInTheDocument();
  });

  it("leaves the capacity select enabled when no headcount is tracked", () => {
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    expect(zone.currentOccupancy).toBeUndefined();
    renderWithData(<ZoneDashboardPage params={resolvedParams({ zoneId: zone.id })} searchParams={emptySearchParams} />);

    expect(screen.getByLabelText(/evacuation center capacity/i)).toBeEnabled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { FIXTURE_REFERENCE_DATA, renderWithData } from "@/test-utils/render-with-data";
import { markConsented, markOnboarded } from "@/features/onboarding/onboarding-storage";
import type { Zone } from "@/lib/types";

let params = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => params,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
}));
// Records the barangay it was mounted for: state that is read once at mount
// (the map's centre, the route) must not outlive a change of barangay.
vi.mock("@/features/homepage-map/homepage-map", () => ({
  HomepageMap: ({ zones }: { zones: Zone[] }) => {
    const [mountedFor] = useState(zones[0].id);
    return <p>mounted-for:{mountedFor}</p>;
  },
}));

import Home from "./page";

const [mine, other] = FIXTURE_REFERENCE_DATA.zones;

/** The home page, plus a way to leave ?zone= the way "Back to my barangay" does. */
function Harness() {
  const [, rerender] = useState(0);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          params = new URLSearchParams();
          rerender(1);
        }}
      >
        back
      </button>
      <Home />
    </>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  markOnboarded();
  markConsented();
  window.localStorage.setItem("weatherwell.selectedZoneId", mine.id);
});

describe("home page (viewing another barangay)", () => {
  it("starts the home screen afresh when the barangay on screen changes", async () => {
    params = new URLSearchParams(`zone=${other.id}`);
    renderWithData(<Harness />);
    expect(await screen.findByText(`mounted-for:${other.id}`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "back" }));

    expect(await screen.findByText(`mounted-for:${mine.id}`)).toBeInTheDocument();
  });
});

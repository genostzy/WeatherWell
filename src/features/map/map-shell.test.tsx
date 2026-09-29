import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

// Leaflet needs a real layout engine; stand in for it and keep the tile
// layer's event handlers so the test can fire "load" itself, and its credit.
let tileHandlers: Record<string, () => void> = {};
let tileAttribution = "";
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: ({ eventHandlers, attribution }: { eventHandlers?: Record<string, () => void>; attribution?: string }) => {
    tileHandlers = eventHandlers ?? {};
    tileAttribution = attribution ?? "";
    return null;
  },
  ZoomControl: () => null,
  ScaleControl: () => null,
}));

import { MapShell } from "./map-shell";

describe("MapShell loading (the map that only loaded after Ctrl+Shift+R)", () => {
  it("says the map is loading until its first tiles arrive", () => {
    render(
      <MapShell center={[16, 120]} ariaLabel="Map">
        <span />
      </MapShell>
    );
    expect(screen.getByRole("status", { name: /loading map/i })).toBeInTheDocument();
    act(() => tileHandlers.load?.());
    expect(screen.queryByRole("status", { name: /loading map/i })).not.toBeInTheDocument();
  });
});

describe("MapShell credit", () => {
  it("credits OpenStreetMap and links to Fix the map, as the walking route planner's usage policy asks", () => {
    render(
      <MapShell center={[16, 120]} ariaLabel="Map">
        <span />
      </MapShell>
    );
    const links = [...new DOMParser().parseFromString(tileAttribution, "text/html").querySelectorAll("a")].map((a) => [
      a.textContent,
      a.getAttribute("href"),
    ]);

    expect(links).toEqual([
      ["OpenStreetMap", "https://www.openstreetmap.org/copyright"],
      ["Fix the map", "https://www.openstreetmap.org/fixthemap"],
    ]);
  });
});

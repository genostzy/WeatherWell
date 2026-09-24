import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

// Leaflet needs a real layout engine; stand in for it and keep the tile
// layer's event handlers so the test can fire "load" itself.
let tileHandlers: Record<string, () => void> = {};
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: ({ eventHandlers }: { eventHandlers?: Record<string, () => void> }) => {
    tileHandlers = eventHandlers ?? {};
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

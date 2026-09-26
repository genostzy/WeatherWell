import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MapContainer } from "react-leaflet";
import { MapCentrePlacer } from "./map-centre-placer";

describe("MapCentrePlacer (WCAG 2.1.1: placing on a map without a pointer)", () => {
  it("places at the centre of the map, which the arrow keys can move", () => {
    const onPlace = vi.fn();
    render(
      <MapContainer center={[16.0288, 120.4366]} zoom={15} style={{ height: 200 }}>
        <MapCentrePlacer onPlace={onPlace} label="Drop the pin at the map's centre" />
      </MapContainer>
    );

    fireEvent.click(screen.getByRole("button", { name: /drop the pin at the map's centre/i }));

    expect(onPlace).toHaveBeenCalledWith(16.0288, 120.4366);
  });
});

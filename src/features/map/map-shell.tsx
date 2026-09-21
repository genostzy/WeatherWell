"use client";

import type { ReactNode } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

/**
 * The parts of a Leaflet map that don't vary between the resident-facing map
 * and the admin one: a sized container, the OSM tile layer, and the overlay
 * plane that floats controls (legend, selectors) above the map.
 *
 * Deliberately a shell that takes children rather than one component with an
 * `isAdmin` flag. The two maps differ in which markers they draw and in what
 * those markers' popups let you do — threading a mode flag through here would
 * mean every future change to the resident map has to reason about the admin
 * map and vice versa, which is the coupling this split exists to avoid.
 */
export function MapShell({
  center,
  ariaLabel,
  className = "",
  preferCanvas = false,
  overlay,
  children,
}: {
  center: [number, number];
  ariaLabel: string;
  /** Extra classes on the container — e.g. a crosshair cursor while placing a pin. */
  className?: string;
  /** Use Canvas renderer for markers (faster for many markers, but breaks jsdom tests). */
  preferCanvas?: boolean;
  /** Controls floated above the map. Children of this need `pointer-events-auto`; the plane itself is transparent to clicks so the map stays draggable. */
  overlay?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative h-[280px] w-full overflow-hidden rounded-xl border-2 border-border sm:h-[400px] lg:h-[600px] ${className}`}
      aria-label={ariaLabel}
    >
      <MapContainer
        center={center}
        zoom={14}
        minZoom={5}
        maxZoom={18}
        scrollWheelZoom={true}
        preferCanvas={preferCanvas}
        maxBounds={[
          [4, 116],
          [21.5, 127],
        ]}
        maxBoundsViscosity={0.9}
        worldCopyJump={true}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {children}
      </MapContainer>

      {overlay && <div className="pointer-events-none absolute inset-0 z-[1000] p-2">{overlay}</div>}
    </div>
  );
}

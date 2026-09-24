"use client";

import { useState, type ReactNode } from "react";
import { MapContainer, TileLayer, ZoomControl, ScaleControl } from "react-leaflet";
import { ArrowUp, Loader2 } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";

const LOADING_MAP: LocalizedText = { en: "Loading map…", fil: "Kinukuha ang mapa…" };
import "leaflet/dist/leaflet.css";

/** Leaflet's own corner-positioning system — "topleft" | "topright" | "bottomleft" | "bottomright". */
type ControlPosition = "topleft" | "topright" | "bottomleft" | "bottomright";

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
  title,
  controlsPosition = "topleft",
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
  /**
   * Names the area and the hazard subject being shown (e.g. "Flood
   * Susceptibility — Barangay Nilombot, Mapandan") — cartographic convention
   * for what a map is actually of. Rendered above the map in normal document
   * flow, not floated over the tiles: both maps' `overlay` content already
   * fills every corner, and this session's earlier overlap fixes are the
   * reason nothing new gets added to that plane.
   */
  title?: string;
  /**
   * Corner for Leaflet's own zoom + scale controls (it stacks same-corner
   * controls itself, so one prop covers both). No single corner is free on
   * both maps — each caller's `overlay` already claims different corners —
   * so this has no shared default; every caller must pick its own free one.
   * Defaults to Leaflet's native "topleft" only because a prop needs some
   * default, not because it usually is free.
   */
  controlsPosition?: ControlPosition;
}) {
  const { lang } = useLanguage();
  // Until the first tiles arrive the map is a grey box, which read as
  // "broken" when tiles were slow (or blocked); say it is loading instead.
  const [tilesLoaded, setTilesLoaded] = useState(false);
  return (
    <div>
      {title && (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-medium">{title}</h2>
          <span
            aria-hidden="true"
            className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted-foreground"
          >
            <ArrowUp className="h-3 w-3" />N
          </span>
        </div>
      )}
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
          zoomControl={false}
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
            eventHandlers={{ load: () => setTilesLoaded(true) }}
          />
          <ZoomControl position={controlsPosition} />
          <ScaleControl position={controlsPosition} imperial={false} />
          {children}
        </MapContainer>

        {!tilesLoaded && (
          <div
            role="status"
            aria-label={t(LOADING_MAP, lang)}
            className="pointer-events-none absolute inset-0 z-[999] flex items-center justify-center"
          >
            <span className="flex items-center gap-2 rounded-lg border-2 border-border bg-background/95 px-3 py-2 text-sm font-medium shadow-md">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              <span lang={lang}>{t(LOADING_MAP, lang)}</span>
            </span>
          </div>
        )}
        {overlay && <div className="pointer-events-none absolute inset-0 z-[1000] p-2">{overlay}</div>}
      </div>
    </div>
  );
}

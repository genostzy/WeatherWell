import type { Severity } from "./severity";

/** Baseline languages per PRD Accessibility & Inclusion #1. */
export type LanguageCode = "en" | "fil";

/**
 * User-facing copy, stored per-language to match the PRD's jsonb columns
 * so Phase 2's Supabase seed needs no remodelling.
 */
export type LocalizedText = Record<LanguageCode, string>;

export type ConfidenceLevel = "estimated" | "validated" | "calibrated";

/**
 * PRD Gap D (post-evacuation accountability, from the Climate Resilience
 * plan): the app tells residents to evacuate but has no signal on whether
 * they did or whether they need help. Phase 1 scope only — this is an
 * unverified self-report, same trust model as community pins, with no
 * location check and no real notification to responders.
 *
 * Lives here rather than in evacuation-checkins.ts because outbox/types.ts
 * needs it and already imports OutboxEntry from evacuation-checkins.ts's
 * sibling — importing back from there would be circular. This is a leaf
 * module (imports only from ./severity), so it's the honest home for a
 * two-value union. evacuation-checkins.ts re-exports it so existing
 * importers do not change.
 */
export type CheckInStatus = "safe" | "needs_help";

type AlertSource = "manual" | "auto_crowdsourced" | "predicted" | "cascade";

export type CenterStatus = "space_available" | "limited" | "full";

export interface Zone {
  id: string;
  psgcBarangayCode: string;
  name: string;
  evacuationCenterName: string;
  evacuationRouteText: LocalizedText;
  lat: number;
  lng: number;
  evacuationCenterLat: number;
  evacuationCenterLng: number;
  /** Pre-authored path from the zone's own point to its evacuation center. Phase 1 only — real routing lands Phase 2+. */
  evacuationRoutePath: [number, number][];
  hotlineNumber: string;
  centerStatus: CenterStatus;
  /** Total headcount the evacuation center can hold. Paired with currentOccupancy below to derive a real "X of Y spots" reading instead of just the manual centerStatus enum (PRD Gap B / Climate Resilience plan). */
  evacuationCenterCapacity: number;
  /**
   * The most recent live headcount an operator entered (evacuation_centers.current_occupancy),
   * or undefined if none has ever been recorded for this centre. Undefined, not a
   * sentinel like 0 or null, because "no live headcount tracked" and "headcount is
   * zero" are different facts — resolveEffectiveCenterStatus falls back to the
   * manual centerStatus only in the former case.
   */
  currentOccupancy?: number;
  downstreamZoneId?: string;
}

export interface AlertRecord {
  id: string;
  zoneId: string;
  severity: Severity;
  message: LocalizedText;
  source: AlertSource;
  confidence: ConfidenceLevel;
  predictedTiming?: LocalizedText;
  issuedAt: string;
  isActive: boolean;
  /**
   * The severity this alert replaced, or undefined if it replaced nothing.
   * Set by the database when an operator changes a zone's alert; layer 9
   * reads it to explain a downgrade without a join or a history walk.
   */
  supersededSeverity?: Severity;
}

export interface PredictionStep {
  severity: Severity;
  label: LocalizedText;
  timing: LocalizedText;
}

export interface CascadeAlert {
  fromZoneId: string;
  toZoneId: string;
  message: LocalizedText;
  estimatedImpactHours: number;
}

export type POICategory =
  | "health_center"
  | "pharmacy"
  | "market"
  | "water_station"
  | "barangay_office";

export interface PointOfInterest {
  id: string;
  zoneId: string;
  category: POICategory;
  name: string;
  lat: number;
  lng: number;
}

export type HazardType = "flood" | "landslide" | "storm_surge";
export type HazardRiskLevel = "low" | "medium" | "high";

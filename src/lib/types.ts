import type { Severity } from "./severity";

/** Baseline languages per PRD Accessibility & Inclusion #1. */
export type LanguageCode = "en" | "fil";

/**
 * User-facing copy, stored per-language to match the PRD's jsonb columns
 * so Phase 2's Supabase seed needs no remodelling.
 */
export type LocalizedText = Record<LanguageCode, string>;

export type ConfidenceLevel = "estimated" | "validated" | "calibrated";

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
  /** Total headcount the evacuation center can hold. Paired with ZoneOverride.currentOccupancy to derive a real "X of Y spots" reading instead of just the manual centerStatus enum (PRD Gap B / Climate Resilience plan). */
  evacuationCenterCapacity: number;
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

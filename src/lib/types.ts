import type { Severity } from "./severity";

/** Baseline languages per PRD Accessibility & Inclusion #1. */
export type LanguageCode = "en" | "fil";

/**
 * User-facing copy, stored per-language to match the PRD's jsonb columns
 * so Phase 2's Supabase seed needs no remodelling.
 */
export type LocalizedText = Record<LanguageCode, string>;

export type ConfidenceLevel = "estimated" | "validated" | "calibrated";

export type AlertSource = "manual" | "auto_crowdsourced" | "predicted" | "cascade";

export type CenterStatus = "space_available" | "limited" | "full";

export interface Zone {
  id: string;
  psgcBarangayCode: string;
  name: string;
  evacuationCenterName: string;
  evacuationRouteText: LocalizedText;
  hotlineNumber: string;
  centerStatus: CenterStatus;
  downstreamZoneId?: string;
}

export interface AlertRecord {
  id: string;
  zoneId: string;
  severity: Severity;
  message: LocalizedText;
  source: AlertSource;
  confidence: ConfidenceLevel;
  predictedTiming?: string;
  issuedAt: string;
  isActive: boolean;
}

export interface PredictionStep {
  severity: Severity;
  label: LocalizedText;
  timing: string;
}

export interface CascadeAlert {
  fromZoneId: string;
  toZoneId: string;
  message: LocalizedText;
  estimatedImpactHours: number;
}

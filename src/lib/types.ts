import type { Severity } from "./severity";

/** Baseline languages per PRD Accessibility & Inclusion #1. */
export type LanguageCode = "en" | "fil";

/**
 * User-facing copy, stored per-language to match the PRD's jsonb columns
 * so Phase 2's Supabase seed needs no remodelling.
 */
export type LocalizedText = Record<LanguageCode, string>;

export interface Zone {
  id: string;
  psgcBarangayCode: string;
  name: string;
  evacuationCenterName: string;
  evacuationRouteText: LocalizedText;
  hotlineNumber: string;
}

export interface AlertRecord {
  id: string;
  zoneId: string;
  severity: Severity;
  message: LocalizedText;
  issuedAt: string;
  isActive: boolean;
}

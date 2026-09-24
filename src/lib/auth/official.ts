/** An appointed official, as the dashboard sees them. Built only from the verified session and their profile row. */
export interface Official {
  userId: string;
  displayName: string;
  /** A PSGC prefix: 10 digits for one barangay, 7 for a whole town. */
  areaCode: string;
  areaName: string;
  level: "barangay" | "municipality" | "admin";
}

export function areaLevel(areaCode: string): "barangay" | "municipality" {
  return areaCode.length === 10 ? "barangay" : "municipality";
}

/**
 * Presentation-only prefix match: a 10-digit barangay area matches only its
 * own barangay; a 7-digit municipal area matches every barangay under it,
 * because a barangay's 10-digit code always starts with its town's 7-digit
 * prefix. The database enforces the real limit independently of this check.
 */
export function isInArea(psgcBarangayCode: string, areaCode: string): boolean {
  return psgcBarangayCode.startsWith(areaCode);
}


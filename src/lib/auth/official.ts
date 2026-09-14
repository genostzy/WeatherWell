/** An appointed official, as the dashboard sees them. Built only from the verified session and their profile row. */
export interface Official {
  userId: string;
  displayName: string;
  /** A PSGC prefix: 10 digits for one barangay, 7 for a whole town. */
  areaCode: string;
  areaName: string;
  level: "barangay" | "municipality";
}

export function areaLevel(areaCode: string): "barangay" | "municipality" {
  return areaCode.length === 10 ? "barangay" : "municipality";
}

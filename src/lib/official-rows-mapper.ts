import type { OfficialRow } from "@/features/admin/officials-panel";

export interface ProfileRow {
  id: string;
  display_name: string | null;
  area_code: string | null;
}

export interface PlaceRow {
  code: string;
  name: string;
}

/** Same 10-digit-barangay / else-municipality split as areaLevel() in src/lib/auth/official.ts — kept separate here because this maps DB rows to display rows, not an area code to a level. */
export function toOfficialRows(
  profiles: ProfileRow[],
  zones: PlaceRow[],
  municipalities: PlaceRow[],
  emailById: Map<string, string>
): OfficialRow[] {
  const zoneNameByCode = new Map(zones.map((z) => [z.code, z.name]));
  const municipalityNameByCode = new Map(municipalities.map((m) => [m.code, m.name]));

  return profiles.map((profile) => ({
    email: emailById.get(profile.id) ?? "(unknown)",
    displayName: profile.display_name ?? "",
    areaName:
      (profile.area_code?.length === 10
        ? zoneNameByCode.get(profile.area_code)
        : municipalityNameByCode.get(profile.area_code ?? "")) ??
      profile.area_code ??
      "",
  }));
}

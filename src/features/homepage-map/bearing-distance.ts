const EARTH_RADIUS_METERS = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

const COMPASS_LABELS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function compassLabelFor(bearingDeg: number): string {
  const index = Math.round(bearingDeg / 45) % 8;
  return COMPASS_LABELS[index];
}

/**
 * Straight-line bearing and distance only — not a walkable route. This
 * can't know what's physically between the two points (a building, a
 * flooded street), which is why the UI must label it as a direction, not
 * a path, per PRD Core Feature #11.
 */
export function getBearingAndDistance(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): { bearingDeg: number; distanceMeters: number; compassLabel: string } {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);

  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  const distanceMeters = EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  const bearingDeg = (Math.atan2(y, x) * 180) / Math.PI;
  const normalizedBearing = (bearingDeg + 360) % 360;

  return {
    bearingDeg: normalizedBearing,
    distanceMeters,
    compassLabel: compassLabelFor(normalizedBearing),
  };
}

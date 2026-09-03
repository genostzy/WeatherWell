import type { PointOfInterest } from "../types";

export const MOCK_POIS: PointOfInterest[] = [
  {
    id: "poi-1",
    zoneId: "zone-1",
    category: "health_center",
    name: "Nilombot Health Center",
    lat: 16.0285,
    lng: 120.4362,
  },
  {
    id: "poi-2",
    zoneId: "zone-1",
    category: "market",
    name: "Mapandan Public Market",
    lat: 16.0292,
    lng: 120.4358,
  },
  {
    id: "poi-3",
    zoneId: "zone-2",
    category: "pharmacy",
    name: "Mangaldan Botika",
    lat: 16.0699,
    lng: 120.4041,
  },
  {
    id: "poi-4",
    zoneId: "zone-2",
    category: "water_station",
    name: "Mangaldan Water Refilling Station",
    lat: 16.07,
    lng: 120.4043,
  },
  {
    id: "poi-5",
    zoneId: "zone-3",
    category: "barangay_office",
    name: "Poblacion, Manaoag Barangay Hall",
    lat: 16.0435,
    lng: 120.4877,
  },
  {
    id: "poi-6",
    zoneId: "zone-4",
    category: "market",
    name: "Santa Barbara Public Market",
    lat: 16.0029,
    lng: 120.4006,
  },
];

export function getPOIsForZone(zoneId: string): PointOfInterest[] {
  return MOCK_POIS.filter((poi) => poi.zoneId === zoneId);
}

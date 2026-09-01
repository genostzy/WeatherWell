import type { Zone, AlertRecord } from "./types";

export const MOCK_ZONES: Zone[] = [
  {
    id: "zone-1",
    psgcBarangayCode: "137404001",
    name: "Barangay San Isidro",
    evacuationCenterName: "San Isidro Elementary School",
    evacuationRouteText: {
      en: "Head to Rizal St., then straight ahead to the school gym on your right.",
      fil: "Dumaan sa Rizal St., pagkatapos ay diretso sa gym ng paaralan sa iyong kanan.",
    },
    hotlineNumber: "09171234567",
  },
  {
    id: "zone-2",
    psgcBarangayCode: "137404002",
    name: "Barangay Malinis",
    evacuationCenterName: "Malinis Covered Court",
    evacuationRouteText: {
      en: "Take Mabini St. north to the covered court beside the health center.",
      fil: "Dumaan sa Mabini St. pahilaga papunta sa covered court katabi ng health center.",
    },
    hotlineNumber: "09171234568",
  },
  {
    id: "zone-3",
    psgcBarangayCode: "137404003",
    name: "Barangay Bagong Silang",
    evacuationCenterName: "Bagong Silang High School",
    evacuationRouteText: {
      en: "Follow Bonifacio Ave. east, then turn left at the chapel to reach the high school.",
      fil: "Sundan ang Bonifacio Ave. pasilangan, kumaliwa sa kapilya papunta sa high school.",
    },
    hotlineNumber: "09171234569",
  },
];

export const MOCK_ALERTS: AlertRecord[] = [
  {
    id: "alert-1",
    zoneId: "zone-1",
    severity: "orange",
    message: {
      en: "Water levels rising near Barangay San Isidro. Monitor conditions and prepare to evacuate.",
      fil: "Tumataas ang tubig malapit sa Barangay San Isidro. Bantayan ang sitwasyon at maghanda nang lumikas.",
    },
    issuedAt: "2026-09-01T08:00:00.000Z",
    isActive: true,
  },
  {
    id: "alert-2",
    zoneId: "zone-2",
    severity: "red",
    message: {
      en: "Waist-deep flooding reported in Barangay Malinis. Move to the evacuation center now.",
      fil: "May baha na hanggang baywang sa Barangay Malinis. Pumunta na sa evacuation center ngayon.",
    },
    issuedAt: "2026-09-01T08:30:00.000Z",
    isActive: true,
  },
];

export function getActiveAlertForZone(zoneId: string): AlertRecord | undefined {
  return MOCK_ALERTS.find((alert) => alert.zoneId === zoneId && alert.isActive);
}

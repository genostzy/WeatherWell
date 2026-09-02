import type { Zone, AlertRecord, PredictionStep, CascadeAlert } from "./types";

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
    centerStatus: "space_available",
    downstreamZoneId: "zone-2",
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
    centerStatus: "limited",
    downstreamZoneId: "zone-3",
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
    centerStatus: "space_available",
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
    source: "auto_crowdsourced",
    confidence: "estimated",
    predictedTiming: { en: "Watch in 3h", fil: "Pagbabantay sa 3h" },
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
    source: "auto_crowdsourced",
    confidence: "estimated",
    predictedTiming: { en: "Warning now", fil: "Babala ngayon" },
    issuedAt: "2026-09-01T08:30:00.000Z",
    isActive: true,
  },
];

const TIMING = {
  in6h: { en: "6h", fil: "6 oras" },
  in3h: { en: "3h", fil: "3 oras" },
  now: { en: "now", fil: "ngayon" },
  in1h: { en: "1h", fil: "1 oras" },
  in12h: { en: "12h", fil: "12 oras" },
};

export const MOCK_PREDICTIONS: Record<string, PredictionStep[]> = {
  "zone-1": [
    { severity: "yellow", label: { en: "Advisory", fil: "Abiso" }, timing: TIMING.in6h },
    { severity: "orange", label: { en: "Watch", fil: "Bantay" }, timing: TIMING.in3h },
    { severity: "red", label: { en: "Warning", fil: "Babala" }, timing: TIMING.now },
    { severity: "evacuate", label: { en: "Evacuate", fil: "Lumikas" }, timing: TIMING.in1h },
  ],
  "zone-2": [
    { severity: "orange", label: { en: "Watch", fil: "Bantay" }, timing: TIMING.in3h },
    { severity: "red", label: { en: "Warning", fil: "Babala" }, timing: TIMING.now },
    { severity: "evacuate", label: { en: "Evacuate", fil: "Lumikas" }, timing: TIMING.in1h },
  ],
  "zone-3": [
    { severity: "yellow", label: { en: "Advisory", fil: "Abiso" }, timing: TIMING.in12h },
    { severity: "orange", label: { en: "Watch", fil: "Bantay" }, timing: TIMING.in6h },
  ],
};

export const MOCK_CASCADES: CascadeAlert[] = [
  {
    fromZoneId: "zone-1",
    toZoneId: "zone-2",
    message: {
      en: "Flooding detected upstream in San Isidro. Possible impact in 2–4 hours.",
      fil: "May baha na na-detect sa itaas sa San Isidro. Posibleng maapektuhan sa 2–4 na oras.",
    },
    estimatedImpactHours: 3,
  },
  {
    fromZoneId: "zone-2",
    toZoneId: "zone-3",
    message: {
      en: "Water levels rising in Malinis. Possible impact in 2–4 hours.",
      fil: "Tumataas ang tubig sa Malinis. Posibleng maapektuhan sa 2–4 na oras.",
    },
    estimatedImpactHours: 3,
  },
];

export const MOCK_SCENARIOS = [
  {
    id: "typhoon",
    name: { en: "Approaching Typhoon", fil: "Paparating na Bagyo" },
    description: {
      en: "Typhoon approaching with 80mm rainfall expected in 6 hours.",
      fil: "Paparating na bagyo na may 80mm ulan sa loob ng 6 na oras.",
    },
  },
  {
    id: "flash-flood",
    name: { en: "Flash Flood", fil: "Biglaang Pagbaha" },
    description: {
      en: "Sudden flash flood from upstream river overflow.",
      fil: "Biglaang pagbaha mula sa pagapawas ng ilog sa itaas.",
    },
  },
  {
    id: "coastal-surge",
    name: { en: "Coastal Surge", fil: "Alon ng Dagat" },
    description: {
      en: "Storm surge combined with high tide affecting coastal zones.",
      fil: "Storm surge na sinamahan ng high tide na nakaaapekto sa coastal zones.",
    },
  },
  {
    id: "monsoon",
    name: { en: "Monsoon Rain", fil: "Ulan ng Habagat" },
    description: {
      en: "Prolonged monsoon rain lasting 24 hours with 120mm total rainfall.",
      fil: "Matagalang ulan ng habagat na 24 oras na may 120mm kabuuang ulan.",
    },
  },
  {
    id: "clear",
    name: { en: "Clear Skies", fil: "Malinaw na Langit" },
    description: {
      en: "No weather threat. All zones clear and safe.",
      fil: "Walang banta ng panahon. Lahat ng zone ay malinis at ligtas.",
    },
  },
  {
    id: "drill",
    name: { en: "Community Drill", fil: "Komunidad na Ehersisyo" },
    description: {
      en: "Simulated emergency drill for training purposes.",
      fil: "Ginayang emergency drill para sa pagsasanay.",
    },
  },
];

export function getActiveAlertForZone(zoneId: string): AlertRecord | undefined {
  return MOCK_ALERTS.find((alert) => alert.zoneId === zoneId && alert.isActive);
}

export function getPredictionsForZone(zoneId: string): PredictionStep[] {
  return MOCK_PREDICTIONS[zoneId] || [];
}

export function getCascadeForZone(zoneId: string): CascadeAlert | undefined {
  return MOCK_CASCADES.find((c) => c.toZoneId === zoneId);
}

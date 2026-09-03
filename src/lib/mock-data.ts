import type { DepthLevel } from "./depth";
import type {
  Zone,
  AlertRecord,
  PredictionStep,
  CascadeAlert,
  PointOfInterest,
  HazardType,
  HazardRiskLevel,
  LocalizedText,
} from "./types";

export const MOCK_ZONES: Zone[] = [
  {
    id: "zone-1",
    // Real PSGC code for Barangay Nilombot, Mapandan.
    psgcBarangayCode: "0105528012",
    name: "Barangay Nilombot, Mapandan",
    evacuationCenterName: "Nilombot Elementary School",
    evacuationRouteText: {
      en: "Head to the barangay road, then straight ahead to the elementary school on your right.",
      fil: "Dumaan sa barangay road, pagkatapos ay diretso sa elementary school sa iyong kanan.",
    },
    lat: 16.0288,
    lng: 120.4366,
    evacuationCenterLat: 16.0295,
    evacuationCenterLng: 120.436,
    evacuationRoutePath: [
      [16.0288, 120.4366],
      [16.0292, 120.4363],
      [16.0295, 120.436],
    ],
    hotlineNumber: "09171234567",
    centerStatus: "space_available",
    downstreamZoneId: "zone-2",
  },
  {
    id: "zone-2",
    // Municipal-level PSGC for Mangaldan; Poblacion's own barangay code is not verified.
    psgcBarangayCode: "0105526000",
    name: "Barangay Poblacion, Mangaldan",
    evacuationCenterName: "Mangaldan Central School",
    evacuationRouteText: {
      en: "Take the town plaza road north to the central school beside the health center.",
      fil: "Dumaan sa daan ng plaza pahilaga papunta sa central school katabi ng health center.",
    },
    lat: 16.0703,
    lng: 120.4038,
    evacuationCenterLat: 16.0698,
    evacuationCenterLng: 120.4045,
    evacuationRoutePath: [
      [16.0703, 120.4038],
      [16.07, 120.4042],
      [16.0698, 120.4045],
    ],
    hotlineNumber: "09171234568",
    centerStatus: "limited",
    downstreamZoneId: "zone-3",
  },
  {
    id: "zone-3",
    // Municipal-level PSGC for Manaoag; Poblacion's own barangay code is not verified.
    psgcBarangayCode: "0105525000",
    name: "Barangay Poblacion, Manaoag",
    evacuationCenterName: "Manaoag Municipal Gymnasium",
    evacuationRouteText: {
      en: "Follow the road east past the church, then turn left at the plaza to reach the gymnasium.",
      fil: "Sundan ang daan pasilangan lagpas sa simbahan, kumaliwa sa plaza papunta sa gymnasium.",
    },
    lat: 16.0433,
    lng: 120.4875,
    evacuationCenterLat: 16.0438,
    evacuationCenterLng: 120.488,
    evacuationRoutePath: [
      [16.0433, 120.4875],
      [16.0436, 120.4878],
      [16.0438, 120.488],
    ],
    hotlineNumber: "09171234569",
    centerStatus: "space_available",
    downstreamZoneId: "zone-4",
  },
  {
    id: "zone-4",
    // Municipal-level PSGC for Santa Barbara; Poblacion's own barangay code is not verified.
    psgcBarangayCode: "0105538000",
    name: "Barangay Poblacion, Santa Barbara",
    evacuationCenterName: "Santa Barbara Central School",
    evacuationRouteText: {
      en: "Head toward the municipal hall, then straight ahead to the central school on your left.",
      fil: "Dumaan sa gilid ng munisipyo, pagkatapos ay diretso sa central school sa iyong kaliwa.",
    },
    lat: 16.0031,
    lng: 120.4008,
    evacuationCenterLat: 16.0026,
    evacuationCenterLng: 120.4013,
    evacuationRoutePath: [
      [16.0031, 120.4008],
      [16.0028, 120.401],
      [16.0026, 120.4013],
    ],
    hotlineNumber: "09171234570",
    centerStatus: "space_available",
  },
];

export const MOCK_ALERTS: AlertRecord[] = [
  {
    id: "alert-1",
    zoneId: "zone-1",
    severity: "orange",
    message: {
      en: "Water levels rising near Barangay Nilombot, Mapandan. Monitor conditions and prepare to evacuate.",
      fil: "Tumataas ang tubig malapit sa Barangay Nilombot, Mapandan. Bantayan ang sitwasyon at maghanda nang lumikas.",
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
      en: "Waist-deep flooding reported in Barangay Poblacion, Mangaldan. Move to the evacuation center now.",
      fil: "May baha na hanggang baywang sa Barangay Poblacion, Mangaldan. Pumunta na sa evacuation center ngayon.",
    },
    source: "auto_crowdsourced",
    confidence: "estimated",
    predictedTiming: { en: "Warning now", fil: "Babala ngayon" },
    issuedAt: "2026-09-01T08:30:00.000Z",
    isActive: true,
  },
  {
    id: "alert-3",
    zoneId: "zone-3",
    severity: "evacuate",
    message: {
      en: "Neck-deep flooding reported in Barangay Poblacion, Manaoag. Evacuate immediately.",
      fil: "May baha na hanggang leeg sa Barangay Poblacion, Manaoag. Lumikas kaagad.",
    },
    source: "auto_crowdsourced",
    confidence: "estimated",
    predictedTiming: { en: "Evacuate now", fil: "Lumikas ngayon" },
    issuedAt: "2026-09-01T09:00:00.000Z",
    isActive: true,
  },
  {
    id: "alert-4",
    zoneId: "zone-4",
    severity: "yellow",
    message: {
      en: "Light rainfall building near Barangay Poblacion, Santa Barbara. Stay alert for updates.",
      fil: "Unti-unting lumalakas ang ulan malapit sa Barangay Poblacion, Santa Barbara. Manatiling alerto.",
    },
    source: "auto_crowdsourced",
    confidence: "estimated",
    predictedTiming: { en: "Advisory now", fil: "Abiso ngayon" },
    issuedAt: "2026-09-01T07:30:00.000Z",
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
    { severity: "orange", label: { en: "Watch", fil: "Bantay" }, timing: TIMING.in3h },
    { severity: "red", label: { en: "Warning", fil: "Babala" }, timing: TIMING.in1h },
    { severity: "evacuate", label: { en: "Evacuate", fil: "Lumikas" }, timing: TIMING.now },
  ],
  "zone-4": [
    { severity: "yellow", label: { en: "Advisory", fil: "Abiso" }, timing: TIMING.in12h },
    { severity: "orange", label: { en: "Watch", fil: "Bantay" }, timing: TIMING.in6h },
  ],
};

export const MOCK_CASCADES: CascadeAlert[] = [
  {
    fromZoneId: "zone-1",
    toZoneId: "zone-2",
    message: {
      en: "Flooding detected upstream in Nilombot, Mapandan. Possible impact in 2–4 hours.",
      fil: "May baha na na-detect sa itaas sa Nilombot, Mapandan. Posibleng maapektuhan sa 2–4 na oras.",
    },
    estimatedImpactHours: 3,
  },
  {
    fromZoneId: "zone-2",
    toZoneId: "zone-3",
    message: {
      en: "Water levels rising in Poblacion, Mangaldan. Possible impact in 2–4 hours.",
      fil: "Tumataas ang tubig sa Poblacion, Mangaldan. Posibleng maapektuhan sa 2–4 na oras.",
    },
    estimatedImpactHours: 3,
  },
  {
    fromZoneId: "zone-3",
    toZoneId: "zone-4",
    message: {
      en: "Water levels rising in Poblacion, Manaoag. Possible impact in 2–4 hours.",
      fil: "Tumataas ang tubig sa Poblacion, Manaoag. Posibleng maapektuhan sa 2–4 na oras.",
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

export const MOCK_HAZARD_SUSCEPTIBILITY: Record<
  string,
  Record<HazardType, HazardRiskLevel>
> = {
  "zone-1": { flood: "high", landslide: "low", storm_surge: "low" },
  "zone-2": { flood: "high", landslide: "low", storm_surge: "low" },
  "zone-3": { flood: "medium", landslide: "low", storm_surge: "low" },
  "zone-4": { flood: "medium", landslide: "low", storm_surge: "low" },
};

export function getPOIsForZone(zoneId: string): PointOfInterest[] {
  return MOCK_POIS.filter((poi) => poi.zoneId === zoneId);
}

export function getHazardSusceptibilityForZone(
  zoneId: string
): Record<HazardType, HazardRiskLevel> {
  return MOCK_HAZARD_SUSCEPTIBILITY[zoneId];
}

export function getActiveAlertForZone(zoneId: string): AlertRecord | undefined {
  return MOCK_ALERTS.find((alert) => alert.zoneId === zoneId && alert.isActive);
}

export function getPredictionsForZone(zoneId: string): PredictionStep[] {
  return MOCK_PREDICTIONS[zoneId] || [];
}

export function getCascadeForZone(zoneId: string): CascadeAlert | undefined {
  return MOCK_CASCADES.find((c) => c.toZoneId === zoneId);
}

/**
 * PRD's Current Conditions panel calls for near-real-time rainfall per zone,
 * sourced from PAGASA in later phases — Phase 1 ships mock readings, same as
 * everything else. Values are in mm/hour.
 */
export const MOCK_RAINFALL_MM_PER_HOUR: Record<string, number> = {
  "zone-1": 18,
  "zone-2": 32,
  "zone-3": 9,
  "zone-4": 4,
};

export function getRainfallForZone(zoneId: string): number {
  return MOCK_RAINFALL_MM_PER_HOUR[zoneId] ?? 0;
}

/** PAGASA's own "heavy" rainfall classification starts around 15mm in an hour. */
export function isHeavyRainfall(mmPerHour: number): boolean {
  return mmPerHour >= 15;
}

export interface TyphoonTrack {
  name: string;
  category: LocalizedText;
  distanceKm: number;
  bearing: string;
  etaHours: number;
}

/**
 * A typhoon's track is regional, not per-barangay — one shared reading for
 * the whole area, unlike rainfall/flood/landslide which are per zone. `null`
 * models "no active system," which the admin dashboard should show plainly
 * rather than always inventing a storm.
 */
export const MOCK_TYPHOON: TyphoonTrack | null = {
  name: "Basyang",
  category: { en: "Severe Tropical Storm", fil: "Malakas na Bagyong Tropikal" },
  distanceKm: 180,
  bearing: "NE",
  etaHours: 14,
};

/** Same near-real-time cadence as rainfall — PRD's Current Conditions panel groups these together. Values in km/h. */
export const MOCK_WIND_KPH: Record<string, number> = {
  "zone-1": 22,
  "zone-2": 35,
  "zone-3": 15,
  "zone-4": 10,
};

export function getWindForZone(zoneId: string): number {
  return MOCK_WIND_KPH[zoneId] ?? 0;
}

/** A forecast watch, not current rain — can be true even where MOCK_RAINFALL_MM_PER_HOUR is still low. */
export const MOCK_THUNDERSTORM_WATCH: Record<string, boolean> = {
  "zone-1": true,
  "zone-2": true,
  "zone-3": false,
  "zone-4": false,
};

export function hasThunderstormWatch(zoneId: string): boolean {
  return MOCK_THUNDERSTORM_WATCH[zoneId] ?? false;
}

export type HeatIndexCategory = "caution" | "extreme_caution" | "danger" | "extreme_danger";

/** PAGASA's own published heat index bands (apparent temperature, °C). */
export function getHeatIndexCategory(celsius: number): HeatIndexCategory {
  if (celsius >= 52) return "extreme_danger";
  if (celsius >= 42) return "danger";
  if (celsius >= 33) return "extreme_caution";
  return "caution";
}

/** Weekly-refresh cadence, unlike rainfall/wind/typhoon/thunderstorm above — see Current Conditions panel's per-reading age requirement. */
export const MOCK_HEAT_INDEX_C: Record<string, number> = {
  "zone-1": 32,
  "zone-2": 29,
  "zone-3": 33,
  "zone-4": 35,
};

export function getHeatIndexForZone(zoneId: string): number {
  return MOCK_HEAT_INDEX_C[zoneId] ?? 0;
}

/** Also weekly-refresh, same public data family as Heat Index — informational only, no severity or alert attached. */
export const MOCK_DROUGHT_OUTLOOK: LocalizedText = {
  en: "No dry spell expected in the next 30 days.",
  fil: "Walang inaasahang tagtuyot sa susunod na 30 araw.",
};

/** Medium/High landslide susceptibility plus currently-heavy rainfall — the pairing the Current Conditions panel's caution note calls out. Shared by the resident-facing panel and the admin Landslide Risk panel so both read the same rule. */
export function hasElevatedLandslideRisk(susceptibility: HazardRiskLevel, mmPerHour: number): boolean {
  return susceptibility !== "low" && isHeavyRainfall(mmPerHour);
}

const WEATHER_READ_LIGHT_RAIN: LocalizedText = {
  en: "cloudy, with a bit of rain expected later",
  fil: "maulap, may kaunting ulan mamaya",
};
const WEATHER_READ_WINDY: LocalizedText = {
  en: "breezy with scattered clouds",
  fil: "mahangin na may pauwing ulap",
};
const WEATHER_READ_CLEAR: LocalizedText = {
  en: "clear skies, light wind",
  fil: "maaliwalas na langit, mahinang hangin",
};

/** The Personal Status Headline's "Safe" follow-up line (PRD Core Feature #9) — a friendly one-line read derived from this same Current Conditions data, not a separate weather system. */
export function getFriendlyWeatherRead(zoneId: string): LocalizedText {
  const rainfall = getRainfallForZone(zoneId);
  if (rainfall > 0) return WEATHER_READ_LIGHT_RAIN;
  if (getWindForZone(zoneId) >= 20) return WEATHER_READ_WINDY;
  return WEATHER_READ_CLEAR;
}

/**
 * Twelve hourly rainfall readings per zone, oldest first, ending on the same
 * value getRainfallForZone returns — so the admin dashboard's trend line and
 * the resident's Current Conditions reading can never disagree. Phase 2+
 * replaces this with real PAGASA history.
 */
export const MOCK_RAINFALL_HISTORY: Record<string, number[]> = {
  "zone-1": [2, 3, 5, 4, 7, 9, 12, 14, 15, 17, 16, 18],
  "zone-2": [4, 6, 9, 12, 15, 19, 22, 26, 28, 30, 31, 32],
  "zone-3": [12, 14, 16, 15, 13, 12, 11, 10, 10, 9, 9, 9],
  "zone-4": [0, 0, 1, 2, 3, 3, 2, 3, 4, 5, 4, 4],
};

export function getRainfallHistoryForZone(zoneId: string): number[] {
  return MOCK_RAINFALL_HISTORY[zoneId] ?? [];
}

/** Daily crowd-report counts per zone for the last 7 days, oldest first — the "reports over time" trend the PRD's admin analytics dashboard calls for. */
export const MOCK_REPORT_HISTORY: Record<string, number[]> = {
  "zone-1": [3, 5, 4, 8, 12, 18, 24],
  "zone-2": [6, 8, 11, 15, 22, 31, 44],
  "zone-3": [12, 15, 19, 26, 22, 17, 13],
  "zone-4": [1, 2, 1, 3, 2, 4, 3],
};

export function getReportHistoryForZone(zoneId: string): number[] {
  return MOCK_REPORT_HISTORY[zoneId] ?? [];
}

export function getReportsTodayForZone(zoneId: string): number {
  const history = getReportHistoryForZone(zoneId);
  return history[history.length - 1] ?? 0;
}

export interface AlertHistory {
  /** Alerts issued in the trailing 30 days. */
  issued: number;
  /** Of those, how many were later downgraded — the PRD's false-alarm-rate metric. */
  downgraded: number;
}

export const MOCK_ALERT_HISTORY: Record<string, AlertHistory> = {
  "zone-1": { issued: 4, downgraded: 1 },
  "zone-2": { issued: 7, downgraded: 1 },
  "zone-3": { issued: 9, downgraded: 2 },
  "zone-4": { issued: 2, downgraded: 0 },
};

export function getAlertHistoryForZone(zoneId: string): AlertHistory {
  return MOCK_ALERT_HISTORY[zoneId] ?? { issued: 0, downgraded: 0 };
}

/** False-alarm rate as a percentage across all zones — PRD success metric, target ≤ 10%. */
export function getFalseAlarmRate(): number {
  const totals = Object.values(MOCK_ALERT_HISTORY).reduce(
    (sum, history) => ({
      issued: sum.issued + history.issued,
      downgraded: sum.downgraded + history.downgraded,
    }),
    { issued: 0, downgraded: 0 }
  );
  if (totals.issued === 0) return 0;
  return Math.round((totals.downgraded / totals.issued) * 100);
}

export interface WaterLevelReport {
  id: string;
  zoneId: string;
  depthLevel: DepthLevel;
  minutesAgo: number;
  /** Reputation weight from PRD Anti-Abuse layer 6 — 1.0 is an unproven device, higher is a device whose past reports matched real outcomes. */
  trustWeight: number;
  isOutlier: boolean;
}

/**
 * Recent individual crowd reports, newest first. Phase 1 shows these as a
 * read-only "what your neighbours are reporting" list; Phase 3's threshold
 * engine is what actually turns them into alerts.
 */
export const MOCK_WATER_LEVEL_REPORTS: WaterLevelReport[] = [
  { id: "report-1", zoneId: "zone-1", depthLevel: "knee", minutesAgo: 8, trustWeight: 1.4, isOutlier: false },
  { id: "report-2", zoneId: "zone-1", depthLevel: "knee", minutesAgo: 21, trustWeight: 1.0, isOutlier: false },
  { id: "report-3", zoneId: "zone-1", depthLevel: "ankle", minutesAgo: 47, trustWeight: 1.2, isOutlier: false },
  { id: "report-4", zoneId: "zone-1", depthLevel: "neck", minutesAgo: 52, trustWeight: 0.4, isOutlier: true },
  { id: "report-5", zoneId: "zone-2", depthLevel: "waist", minutesAgo: 5, trustWeight: 1.6, isOutlier: false },
  { id: "report-6", zoneId: "zone-2", depthLevel: "waist", minutesAgo: 14, trustWeight: 1.1, isOutlier: false },
  { id: "report-7", zoneId: "zone-2", depthLevel: "knee", minutesAgo: 38, trustWeight: 1.0, isOutlier: false },
  { id: "report-8", zoneId: "zone-3", depthLevel: "neck", minutesAgo: 11, trustWeight: 1.8, isOutlier: false },
  { id: "report-9", zoneId: "zone-3", depthLevel: "waist", minutesAgo: 33, trustWeight: 1.3, isOutlier: false },
  { id: "report-10", zoneId: "zone-4", depthLevel: "dry", minutesAgo: 26, trustWeight: 1.0, isOutlier: false },
  { id: "report-11", zoneId: "zone-4", depthLevel: "ankle", minutesAgo: 63, trustWeight: 1.1, isOutlier: false },
];

export function getRecentReportsForZone(zoneId: string): WaterLevelReport[] {
  return MOCK_WATER_LEVEL_REPORTS.filter((report) => report.zoneId === zoneId).sort(
    (a, b) => a.minutesAgo - b.minutesAgo
  );
}

/** PRD Anti-Abuse layer 3: no single report triggers an alert — several agreeing ones must arrive first. */
export const REPORT_THRESHOLD = 3;

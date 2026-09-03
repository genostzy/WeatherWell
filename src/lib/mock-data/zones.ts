import type { Zone } from "../types";

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

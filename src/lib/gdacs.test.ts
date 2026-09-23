import { describe, it, expect } from "vitest";
import { gdacsUrl, pickPhilippineCyclone, gdacsTrackRecord } from "./gdacs";

function feature(p: Record<string, unknown>, coords: [number, number]) {
  return { type: "Feature", geometry: { type: "Point", coordinates: coords }, properties: p };
}

const CURRENT_PH = feature(
  {
    eventname: "HAGIBIS-26",
    iscurrent: "true",
    alertlevel: "Orange",
    affectedcountries: [{ iso3: "PHL" }],
    severitydata: { severity: 150.4, severitytext: "Typhoon (maximum wind speed of 150 km/h)" },
    datemodified: "2026-09-23T09:00:00",
    url: { report: "https://www.gdacs.org/report.aspx?eventid=1" },
  },
  [124.5, 14.2]
);

describe("GDACS backup typhoon source (idea 16)", () => {
  it("asks for recent tropical cyclones", () => {
    expect(gdacsUrl(new Date("2026-09-23T12:00:00Z"))).toBe(
      "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC&fromDate=2026-09-16&toDate=2026-09-23"
    );
  });

  it("picks a current cyclone affecting the Philippines", () => {
    const c = pickPhilippineCyclone({ features: [CURRENT_PH] });
    expect(c).toMatchObject({ name: "HAGIBIS-26", lat: 14.2, lng: 124.5, maxWindsKph: 150, alertLevel: "Orange" });
  });

  it("also picks a current one inside PAGASA's area even if not yet listed for the Philippines", () => {
    const inPar = feature({ ...CURRENT_PH.properties, affectedcountries: [{ iso3: "JPN" }] }, [130, 20]);
    expect(pickPhilippineCyclone({ features: [inPar] })?.name).toBe("HAGIBIS-26");
  });

  it("ignores finished cyclones and ones far away", () => {
    const finished = feature({ ...CURRENT_PH.properties, iscurrent: "false" }, [124.5, 14.2]);
    const far = feature({ ...CURRENT_PH.properties, affectedcountries: [{ iso3: "USA" }] }, [-150, 20]);
    expect(pickPhilippineCyclone({ features: [finished, far] })).toBeNull();
    expect(pickPhilippineCyclone("<html>")).toBeNull();
  });

  it("stores it saying where it came from, with no PAGASA signal it cannot know", () => {
    const record = gdacsTrackRecord(pickPhilippineCyclone({ features: [CURRENT_PH] })!, "2026-09-23T12:00:00.000Z");
    expect(record).toMatchObject({
      name: "HAGIBIS-26",
      source: "GDACS",
      wind_signal: 0,
      max_winds_kph: 150,
      issued_at: "2026-09-23T09:00:00Z",
      is_active: true,
    });
    expect(record.positions[0]).toMatchObject({ lat: 14.2, lng: 124.5 });
    expect(record.headline).toMatch(/PAGASA could not be reached/i);
  });
});

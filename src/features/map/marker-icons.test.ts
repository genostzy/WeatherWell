import { describe, it, expect } from "vitest";
import {
  createStatusMarkerIcon,
  createPoiMarkerIcon,
  createEvacuationMarkerIcon,
} from "./marker-icons";
import { SAFE_HEX } from "@/lib/zone-status";
import { SEVERITY_HEX } from "@/lib/severity";

describe("createStatusMarkerIcon", () => {
  it("gives each status a distinct shape class, not color alone", () => {
    const shapes = ["safe", "cautionary", "dangerous", "hazardous"].map(
      (status) => createStatusMarkerIcon(status as never, SAFE_HEX, "label").options.className
    );
    expect(new Set(shapes).size).toBe(4);
  });

  it("bakes an accessible label into the marker HTML", () => {
    const icon = createStatusMarkerIcon(
      "hazardous",
      SEVERITY_HEX.evacuate,
      "Barangay San Isidro — Hazardous"
    );
    expect(icon.options.html).toContain("Barangay San Isidro — Hazardous");
    expect(icon.options.html).toContain('role="img"');
  });
});

describe("createPoiMarkerIcon", () => {
  it("gives every POI category a distinct icon class", () => {
    const categories = [
      "health_center",
      "pharmacy",
      "market",
      "water_station",
      "barangay_office",
    ] as const;
    const classes = categories.map((c) => createPoiMarkerIcon(c, "label").options.className);
    expect(new Set(classes).size).toBe(categories.length);
  });

  it("embeds a rendered lucide SVG glyph for each category", () => {
    const icon = createPoiMarkerIcon("pharmacy", "Barangay Pharmacy");
    expect(icon.options.html).toContain("<svg");
    expect(icon.options.html).toContain("Barangay Pharmacy");
  });
});

describe("createEvacuationMarkerIcon", () => {
  it("returns a divIcon with the given label baked in", () => {
    const icon = createEvacuationMarkerIcon("San Isidro Elementary School");
    expect(icon.options.html).toContain("San Isidro Elementary School");
  });

  it("embeds a rendered lucide SVG glyph", () => {
    const icon = createEvacuationMarkerIcon("San Isidro Elementary School");
    expect(icon.options.html).toContain("<svg");
  });
});

describe("label HTML-escaping", () => {
  const maliciousLabel = `"><script>alert(1)</script>&`;

  it("escapes an unsafe label in createStatusMarkerIcon instead of injecting raw markup", () => {
    const icon = createStatusMarkerIcon("hazardous", SEVERITY_HEX.evacuate, maliciousLabel);
    expect(icon.options.html).not.toContain("<script>");
    expect(icon.options.html).toContain("&lt;script&gt;");
    expect(icon.options.html).toContain("&quot;");
    expect(icon.options.html).toContain("&amp;");
  });

  it("escapes an unsafe label in createPoiMarkerIcon instead of injecting raw markup", () => {
    const icon = createPoiMarkerIcon("pharmacy", maliciousLabel);
    expect(icon.options.html).not.toContain("<script>");
    expect(icon.options.html).toContain("&lt;script&gt;");
    expect(icon.options.html).toContain("&quot;");
    expect(icon.options.html).toContain("&amp;");
  });

  it("escapes an unsafe label in createEvacuationMarkerIcon instead of injecting raw markup", () => {
    const icon = createEvacuationMarkerIcon(maliciousLabel);
    expect(icon.options.html).not.toContain("<script>");
    expect(icon.options.html).toContain("&lt;script&gt;");
    expect(icon.options.html).toContain("&quot;");
    expect(icon.options.html).toContain("&amp;");
  });
});

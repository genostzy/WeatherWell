export type Severity = "yellow" | "orange" | "red" | "evacuate";

export const SEVERITY_ORDER: Severity[] = ["yellow", "orange", "red", "evacuate"];

export const SEVERITY_LABEL: Record<Severity, string> = {
  yellow: "Advisory",
  orange: "Watch",
  red: "Warning",
  evacuate: "Evacuate Now",
};

export const SEVERITY_BADGE_CLASS: Record<Severity, string> = {
  yellow: "bg-severity-yellow text-black border-severity-yellow",
  orange: "bg-severity-orange text-black border-severity-orange",
  red: "bg-severity-red text-white border-severity-red",
  evacuate: "bg-severity-evacuate text-white border-severity-evacuate",
};

/** Mirrors the --color-severity-* tokens in globals.css. */
export const SEVERITY_HEX: Record<Severity, string> = {
  yellow: "#eab308",
  orange: "#f97316",
  red: "#dc2626",
  evacuate: "#7f1d1d",
};

/** The text color placed on top of each severity background. */
export const SEVERITY_TEXT_HEX: Record<Severity, string> = {
  yellow: "#000000",
  orange: "#000000",
  red: "#ffffff",
  evacuate: "#ffffff",
};

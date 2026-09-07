import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { ReferenceDataContext } from "@/lib/reference-data/provider";
import type { ReferenceData } from "@/lib/reference-data/types";
import { MOCK_ZONES, MOCK_POIS, MOCK_HAZARD_SUSCEPTIBILITY } from "@/lib/mock-data";
import type { LanguageCode } from "@/lib/types";

/**
 * The seeded fixtures, as reference data. `mock-data` remains the single
 * source of truth for demo content — it is what generates the database seed —
 * so tests and the seeded database describe the same four barangays.
 *
 * Provides the context value directly rather than mounting ReferenceDataProvider,
 * so tests never touch fetch and never wait on a gate they are not testing.
 */
export const FIXTURE_REFERENCE_DATA: ReferenceData = {
  zones: MOCK_ZONES,
  pois: MOCK_POIS,
  hazards: MOCK_HAZARD_SUSCEPTIBILITY,
};

export function renderWithData(
  ui: ReactElement,
  options: { data?: Partial<ReferenceData>; lang?: LanguageCode } = {}
): RenderResult {
  const data: ReferenceData = { ...FIXTURE_REFERENCE_DATA, ...options.data };
  return render(
    <TooltipProvider>
      <LanguageProvider initialLang={options.lang}>
        <ReferenceDataContext.Provider value={data}>{ui}</ReferenceDataContext.Provider>
      </LanguageProvider>
    </TooltipProvider>
  );
}

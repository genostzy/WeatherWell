import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { ReferenceDataContext } from "@/lib/reference-data/provider";
import type { ReferenceData } from "@/lib/reference-data/types";
import { AlertsContext, AlertsRefreshContext } from "@/lib/alerts-store";
import { MOCK_ZONES, MOCK_POIS, MOCK_HAZARD_SUSCEPTIBILITY, MOCK_ALERTS } from "@/lib/mock-data";
import type { AlertRecord, LanguageCode } from "@/lib/types";
import { OfficialContext } from "@/lib/auth/official-context";
import type { Official } from "@/lib/auth/official";

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

/**
 * Test-only: an empty areaCode is a prefix of every fixture code, so existing
 * admin tests keep every control. Production can never produce this — the
 * database's area_code check requires 7 or 10 digits. New tests pass a real
 * area to exercise the limits.
 */
const TEST_OFFICIAL: Official = {
  userId: "test-official",
  displayName: "Test Official",
  areaCode: "",
  areaName: "All test zones",
  level: "municipality",
};

/**
 * The alerts here are a fixed value, so there is nothing to refetch. Tests
 * that need a write to show up on screen mount the real ReferenceDataProvider
 * (see the C1 tests on the zone page and the admin map).
 */
const noRefresh = async () => {};

export function renderWithData(
  ui: ReactElement,
  options: {
    data?: Partial<ReferenceData>;
    lang?: LanguageCode;
    alerts?: AlertRecord[];
    official?: Official | null;
  } = {}
): RenderResult {
  const data: ReferenceData = { ...FIXTURE_REFERENCE_DATA, ...options.data };
  const alerts = options.alerts ?? MOCK_ALERTS;
  const official = options.official === undefined ? TEST_OFFICIAL : options.official;
  return render(
    <TooltipProvider>
      <LanguageProvider initialLang={options.lang}>
        <ReferenceDataContext.Provider value={data}>
          <AlertsContext.Provider value={alerts}>
            <AlertsRefreshContext.Provider value={noRefresh}>
              <OfficialContext.Provider value={official}>{ui}</OfficialContext.Provider>
            </AlertsRefreshContext.Provider>
          </AlertsContext.Provider>
        </ReferenceDataContext.Provider>
      </LanguageProvider>
    </TooltipProvider>
  );
}

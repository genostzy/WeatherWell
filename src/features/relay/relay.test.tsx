import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RelayButton, RelayContactsEditor } from "./relay";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { saveRelayContacts, loadRelayContacts } from "@/lib/relay-contacts";
import { getActiveAlertForZone } from "@/lib/mock-data";
import { zoneWithSeverity } from "@/test-utils/mock-fixtures";

const zone = zoneWithSeverity("red");
const alert = getActiveAlertForZone(zone.id)!;

describe("RelayButton", () => {
  beforeEach(() => localStorage.clear());

  it("texts every saved contact the alert in one tap", () => {
    saveRelayContacts([
      { name: "Lola", number: "0917 123 0000" },
      { name: "Kapitbahay", number: "0918 000 1111" },
    ]);
    render(<RelayButton alert={alert} zone={zone} />);
    const link = screen.getByRole("link", { name: /text 2 neighbours/i });
    const href = link.getAttribute("href")!;
    expect(href).toMatch(/^sms:/);
    expect(href).toContain("09171230000,09180001111");
    expect(decodeURIComponent(href)).toContain(alert.message.en);
  });

  it("says neighbour, not neighbours, for one", () => {
    saveRelayContacts([{ name: "Lola", number: "0917 123 0000" }]);
    render(<RelayButton alert={alert} zone={zone} />);
    expect(screen.getByRole("link", { name: "Text 1 neighbour" })).toBeInTheDocument();
  });

  it("points to setup when no contacts are saved", () => {
    render(
      <LanguageProvider initialLang="fil">
        <RelayButton alert={alert} zone={zone} />
      </LanguageProvider>
    );
    expect(screen.getByRole("link", { name: /kapitbahay/i })).toHaveAttribute("href", "/evacuation#relay");
  });
});

describe("RelayContactsEditor", () => {
  beforeEach(() => localStorage.clear());

  it("saves a contact on this device", () => {
    render(<RelayContactsEditor />);
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Lola Nena" } });
    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "09171230000" } });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    expect(loadRelayContacts()).toEqual([{ name: "Lola Nena", number: "09171230000" }]);
    expect(screen.getByText("Lola Nena")).toBeInTheDocument();
  });

  it("removes a contact", () => {
    saveRelayContacts([{ name: "Lola", number: "0917" }]);
    render(<RelayContactsEditor />);
    fireEvent.click(screen.getByRole("button", { name: /remove lola/i }));
    expect(loadRelayContacts()).toEqual([]);
  });

  it("stops offering to add once five are saved", () => {
    saveRelayContacts(Array.from({ length: 5 }, (_, i) => ({ name: `N${i}`, number: `0917${i}` })));
    render(<RelayContactsEditor />);
    expect(screen.queryByRole("button", { name: /add/i })).not.toBeInTheDocument();
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card } from "./card";
import { RadioGroup, RadioGroupItem } from "./radio-group";
import { Select, SelectTrigger, SelectValue } from "./select";

/**
 * The PRD asks for high-contrast, large targets and thick borders. These are
 * shared-primitive guarantees: fixing them here is what keeps every call site
 * compliant without per-usage overrides, so regressions belong here too.
 */
describe("shared control sizing", () => {
  it("gives size=lg buttons at least a 44px height", () => {
    render(<Button size="lg">Confirm zone</Button>);
    // h-11 is 2.75rem = 44px, the WCAG 2.5.5 minimum.
    expect(screen.getByRole("button").className).toMatch(/h-11/);
  });

  it("gives radio items a tap target over 44px via size plus hit-area extension", () => {
    render(
      <RadioGroup value="a">
        <RadioGroupItem value="a" aria-label="A" />
      </RadioGroup>
    );
    const item = screen.getByRole("radio", { name: "A" });
    // size-6 (24px) + after:-inset-3 (12px each side) = a 48x48 tap target.
    expect(item.className).toMatch(/size-6/);
    expect(item.className).toMatch(/after:-inset-3/);
  });

  it("gives Card a real thick border rather than a faint ring", () => {
    const { container } = render(<Card>content</Card>);
    const card = container.querySelector('[data-slot="card"]')!;
    expect(card.className).toMatch(/border-2/);
    expect(card.className).toMatch(/border-border/);
    expect(card.className).not.toMatch(/ring-foreground/);
  });

  it("makes the badge legible at a glance, not 20px of text-xs", () => {
    render(<Badge>Warning</Badge>);
    const badge = screen.getByText("Warning");
    expect(badge.className).toMatch(/h-7/);
    expect(badge.className).toMatch(/text-sm/);
    expect(badge.className).not.toMatch(/text-xs/);
  });

  it("gives the select trigger at least a 44px height", () => {
    render(
      <Select value="a">
        <SelectTrigger aria-label="Zone">
          <SelectValue />
        </SelectTrigger>
      </Select>
    );
    expect(screen.getByRole("combobox").className).toMatch(/h-11/);
  });
});

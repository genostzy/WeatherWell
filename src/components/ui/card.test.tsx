import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card, CardHeader, CardTitle } from "./card";

describe("CardTitle (WCAG 1.3.1: what looks like a heading is one)", () => {
  it("is a heading, so a screen reader can jump between panels", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Updates</CardTitle>
        </CardHeader>
      </Card>
    );
    expect(screen.getByRole("heading", { level: 2, name: "Updates" })).toBeInTheDocument();
  });
});

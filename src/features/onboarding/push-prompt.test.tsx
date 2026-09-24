import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithData } from "@/test-utils/render-with-data";
import type { SubscribeResult } from "@/lib/push-subscription";

const subscribe = vi.fn<() => Promise<SubscribeResult>>();
vi.mock("@/lib/push-subscription", () => ({
  usePushSubscription: () => ({
    state: { isSupported: true, permission: "default", subscription: null, isLoading: false },
    subscribe,
    unsubscribe: vi.fn(),
  }),
}));

import { PushPrompt } from "./push-prompt";

beforeEach(() => subscribe.mockReset());

describe("PushPrompt tells the resident what happened (found testing push on a phone)", () => {
  it.each([
    ["failed", /couldn't turn on alerts/i],
    ["no-session", /needs a connection/i],
    ["no-zone", /choose your barangay first/i],
    ["denied", /blocked/i],
  ] as const)("says so when subscribing ends %s", async (result, message) => {
    subscribe.mockResolvedValue(result);
    renderWithData(<PushPrompt zoneId="zone-1" />);
    fireEvent.click(screen.getByRole("button", { name: /turn on alerts/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("confirms when alerts are on", async () => {
    subscribe.mockResolvedValue("subscribed");
    renderWithData(<PushPrompt zoneId="zone-1" />);
    fireEvent.click(screen.getByRole("button", { name: /turn on alerts/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(/alerts are on/i);
  });
});

import { describe, it, expect } from "vitest";
import { readTestPasswords, MIN_PASSWORD_LENGTH } from "./rotate-test-account-passwords";

const GOOD = "a".repeat(MIN_PASSWORD_LENGTH);

describe("readTestPasswords", () => {
  it("returns one entry per test account when all three are set and long enough", () => {
    const result = readTestPasswords({
      TEST_ADMIN_PASSWORD: `${GOOD}1`,
      TEST_OFFICIAL_PASSWORD: `${GOOD}2`,
      TEST_USER_PASSWORD: `${GOOD}3`,
    });

    expect(result).toEqual({
      ok: true,
      passwords: [
        { email: "admin@weatherwell.com", password: `${GOOD}1` },
        { email: "official@weatherwell.com", password: `${GOOD}2` },
        { email: "user@weatherwell.com", password: `${GOOD}3` },
      ],
    });
  });

  it("names every missing variable instead of stopping at the first", () => {
    const result = readTestPasswords({ TEST_OFFICIAL_PASSWORD: GOOD });

    expect(result).toEqual({
      ok: false,
      error: "TEST_ADMIN_PASSWORD is not set; TEST_USER_PASSWORD is not set",
    });
  });

  it("refuses a password below the minimum length without echoing it", () => {
    const result = readTestPasswords({
      TEST_ADMIN_PASSWORD: "tiny1",
      TEST_OFFICIAL_PASSWORD: GOOD,
      TEST_USER_PASSWORD: GOOD,
    });

    expect(result).toEqual({ ok: false, error: "TEST_ADMIN_PASSWORD is shorter than 12 characters" });
    expect(JSON.stringify(result)).not.toContain("tiny1");
  });
});

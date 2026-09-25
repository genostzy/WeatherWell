import { describe, it, expect } from "vitest";
import { readTestPasswords, MIN_PASSWORD_LENGTH, OLD_ACCOUNTS, TEST_ACCOUNTS } from "./reset-test-accounts";

const GOOD = "a".repeat(MIN_PASSWORD_LENGTH);

describe("readTestPasswords", () => {
  it("returns one entry per test account when all four are set and long enough", () => {
    const result = readTestPasswords({
      TEST_ADMIN_PASSWORD: `${GOOD}1`,
      TEST_BARANGAY_PASSWORD: `${GOOD}2`,
      TEST_USER_PASSWORD: `${GOOD}3`,
      TEST_MUNICIPAL_PASSWORD: `${GOOD}4`,
    });

    expect(result).toEqual({
      ok: true,
      passwords: [
        { email: "admintest@weatherwell.com", password: `${GOOD}1` },
        { email: "brgy.nilombottest@weatherwell.com", password: `${GOOD}2` },
        { email: "usertest@weatherwell.com", password: `${GOOD}3` },
        { email: "mun.mapandantest@weatherwell.com", password: `${GOOD}4` },
      ],
    });
  });

  it("names every missing variable instead of stopping at the first", () => {
    const result = readTestPasswords({ TEST_USER_PASSWORD: GOOD });

    expect(result).toEqual({
      ok: false,
      error: "TEST_ADMIN_PASSWORD is not set; TEST_BARANGAY_PASSWORD is not set; TEST_MUNICIPAL_PASSWORD is not set",
    });
  });

  it("refuses a password below the minimum length without echoing it", () => {
    const result = readTestPasswords({
      TEST_ADMIN_PASSWORD: "tiny1",
      TEST_BARANGAY_PASSWORD: GOOD,
      TEST_USER_PASSWORD: GOOD,
      TEST_MUNICIPAL_PASSWORD: GOOD,
    });

    expect(result).toEqual({ ok: false, error: "TEST_ADMIN_PASSWORD is shorter than 12 characters" });
    expect(JSON.stringify(result)).not.toContain("tiny1");
  });
});

describe("the accounts", () => {
  it("never deletes an account it is about to create", () => {
    const created = new Set(TEST_ACCOUNTS.map((account) => account.email));
    expect(OLD_ACCOUNTS.filter((email) => created.has(email))).toEqual([]);
  });

  it("appoints the barangay official to Nilombot and the municipal one to Mapandan", () => {
    const areas = Object.fromEntries(TEST_ACCOUNTS.map((account) => [account.email, account.area]));
    expect(areas["brgy.nilombottest@weatherwell.com"]).toBe("0105528012");
    expect(areas["mun.mapandantest@weatherwell.com"]).toBe("0105528");
  });
});

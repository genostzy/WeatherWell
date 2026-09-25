import { describe, it, expect, vi, beforeEach } from "vitest";

const getClaims = vi.fn();
const userRpc = vi.fn();
vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims }, rpc: userRpc }),
}));

const serviceRpc = vi.fn();
const updateUserById = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: serviceRpc, auth: { admin: { updateUserById } } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
  userRpc.mockResolvedValue({ data: null, error: null });
  serviceRpc.mockResolvedValue({ data: null, error: null });
  updateUserById.mockResolvedValue({ error: null });
});

const answers = { question1: "favorite_food", answer1: "adobo", question2: "mobile_number", answer2: "09171234567" };

describe("setRecoveryAnswers", () => {
  it("hands the answers to the database, which checks and hashes them", async () => {
    const { setRecoveryAnswers } = await import("./recovery");
    expect(await setRecoveryAnswers(answers)).toEqual({ ok: true });
    expect(userRpc).toHaveBeenCalledWith("set_recovery_answers", {
      p_question_1: "favorite_food",
      p_answer_1: "adobo",
      p_question_2: "mobile_number",
      p_answer_2: "09171234567",
    });
  });

  it("refuses without a session", async () => {
    getClaims.mockResolvedValue({ data: null });
    const { setRecoveryAnswers } = await import("./recovery");
    expect((await setRecoveryAnswers(answers)).ok).toBe(false);
    expect(userRpc).not.toHaveBeenCalled();
  });
});

describe("getRecoveryQuestions", () => {
  it("returns the two questions the database picks for the email", async () => {
    serviceRpc.mockResolvedValue({ data: [{ question_1: "first_pet", question_2: "birth_town" }], error: null });
    const { getRecoveryQuestions } = await import("./recovery");
    expect(await getRecoveryQuestions("resident@example.com")).toEqual({ ok: true, questions: ["first_pet", "birth_town"] });
    expect(serviceRpc).toHaveBeenCalledWith("recovery_questions_for", { p_email: "resident@example.com" });
  });

  it("does not ask the database about something that is not an email", async () => {
    const { getRecoveryQuestions } = await import("./recovery");
    expect((await getRecoveryQuestions("not an email")).ok).toBe(false);
    expect(serviceRpc).not.toHaveBeenCalled();
  });
});

describe("resetPasswordWithAnswers", () => {
  const input = { email: "resident@example.com", answer1: "adobo", answer2: "09171234567", password: "newpass123" };

  it("sets the new password on the account whose answers matched", async () => {
    serviceRpc.mockResolvedValue({ data: "user-9", error: null });
    const { resetPasswordWithAnswers } = await import("./recovery");
    expect(await resetPasswordWithAnswers(input)).toEqual({ ok: true });
    expect(serviceRpc).toHaveBeenCalledWith("verify_recovery_answers", {
      p_email: "resident@example.com",
      p_answer_1: "adobo",
      p_answer_2: "09171234567",
    });
    expect(updateUserById).toHaveBeenCalledWith("user-9", { password: "newpass123" });
  });

  it("changes nothing when the answers do not match", async () => {
    const { resetPasswordWithAnswers } = await import("./recovery");
    expect(await resetPasswordWithAnswers(input)).toEqual({ ok: false, permanent: true, error: "Those answers don't match." });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("passes the database's lockout on", async () => {
    serviceRpc.mockResolvedValue({ data: null, error: { code: "54000", message: "Too many tries. Try again in an hour." } });
    const { resetPasswordWithAnswers } = await import("./recovery");
    expect(await resetPasswordWithAnswers(input)).toMatchObject({ ok: false, error: "Too many tries. Try again in an hour." });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("refuses a password shorter than Supabase accepts before checking answers", async () => {
    const { resetPasswordWithAnswers } = await import("./recovery");
    expect((await resetPasswordWithAnswers({ ...input, password: "123" })).ok).toBe(false);
    expect(serviceRpc).not.toHaveBeenCalled();
  });
});

describe("resetOfficialPassword", () => {
  it("sets the password only after the database authorises the admin", async () => {
    userRpc.mockResolvedValue({ data: "official-2", error: null });
    const { resetOfficialPassword } = await import("./recovery");
    expect(await resetOfficialPassword({ email: "official@example.com", password: "newpass123" })).toEqual({ ok: true });
    expect(userRpc).toHaveBeenCalledWith("admin_authorize_password_reset", { p_email: "official@example.com" });
    expect(updateUserById).toHaveBeenCalledWith("official-2", { password: "newpass123" });
  });

  it("changes nothing when the database refuses", async () => {
    userRpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Only an admin can reset an official's password." } });
    const { resetOfficialPassword } = await import("./recovery");
    expect((await resetOfficialPassword({ email: "official@example.com", password: "newpass123" })).ok).toBe(false);
    expect(updateUserById).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ForgotPasswordPanel } from "./forgot-password-panel";
import { LanguageProvider } from "@/features/i18n/language-provider";

const getRecoveryQuestions = vi.fn();
const resetPasswordWithAnswers = vi.fn();
vi.mock("@/app/actions/recovery", () => ({
  getRecoveryQuestions: (...args: unknown[]) => getRecoveryQuestions(...args),
  resetPasswordWithAnswers: (...args: unknown[]) => resetPasswordWithAnswers(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getRecoveryQuestions.mockResolvedValue({ ok: true, questions: ["first_pet", "mobile_number"] });
  resetPasswordWithAnswers.mockResolvedValue({ ok: true });
});

function renderPanel(lang: "en" | "fil" = "en") {
  render(
    <LanguageProvider initialLang={lang}>
      <ForgotPasswordPanel />
    </LanguageProvider>
  );
}

describe("ForgotPasswordPanel", () => {
  it("asks the account's own two questions, then sets the new password", async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "resident@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    fireEvent.change(await screen.findByLabelText(/first pet/i), { target: { value: "Bantay" } });
    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "0917 123 4567" } });
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: "newpass123" } });
    fireEvent.click(screen.getByRole("button", { name: /set new password/i }));

    expect(await screen.findByText(/your password is changed/i)).toBeInTheDocument();
    expect(getRecoveryQuestions).toHaveBeenCalledWith("resident@example.com");
    expect(resetPasswordWithAnswers).toHaveBeenCalledWith({
      email: "resident@example.com",
      answer1: "Bantay",
      answer2: "0917 123 4567",
      password: "newpass123",
    });
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/sign-in");
  });

  it("says plainly, in the reader's language, when the answers do not match", async () => {
    resetPasswordWithAnswers.mockResolvedValue({ ok: false, permanent: true, error: "Those answers don't match." });
    renderPanel("fil");
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "resident@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /susunod/i }));

    fireEvent.change(await screen.findByLabelText(/alagang hayop/i), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "0000000000" } });
    fireEvent.change(screen.getByLabelText(/bagong password/i), { target: { value: "newpass123" } });
    fireEvent.click(screen.getByRole("button", { name: /itakda/i }));

    expect(await screen.findByText("Hindi tugma ang mga sagot.")).toBeInTheDocument();
  });

  it("tells officials to go through their admin", () => {
    renderPanel();
    expect(screen.getByText(/officials: ask your admin/i)).toBeInTheDocument();
  });
});

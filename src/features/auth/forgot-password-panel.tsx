"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { friendlyError } from "@/lib/friendly-error";
import { RECOVERY_QUESTIONS, type RecoveryQuestion } from "@/lib/recovery-questions";
import type { LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = { en: "Forgot your password?", fil: "Nakalimutan ang password?" };
const EMAIL_STEP: LocalizedText = {
  en: "Enter the email you signed up with, then answer your two security questions.",
  fil: "Ilagay ang email na ginamit mo sa pag-sign up, saka sagutin ang dalawa mong tanong pangseguridad.",
};
const OFFICIALS_NOTE: LocalizedText = {
  en: "Officials: ask your admin to set a new password for you. Signed in with Google? Use Continue with Google instead.",
  fil: "Mga opisyal: hilingin sa inyong admin na magtakda ng bagong password. Naka-sign in gamit ang Google? Gamitin ang Magpatuloy gamit ang Google.",
};
const EMAIL_LABEL: LocalizedText = { en: "Email", fil: "Email" };
const NEXT: LocalizedText = { en: "Next", fil: "Susunod" };
const NEW_PASSWORD: LocalizedText = { en: "New password", fil: "Bagong password" };
const SET_PASSWORD: LocalizedText = { en: "Set new password", fil: "Itakda ang bagong password" };
const DONE: LocalizedText = {
  en: "Your password is changed. Sign in with the new one.",
  fil: "Napalitan na ang iyong password. Mag-sign in gamit ang bago.",
};
const SIGN_IN: LocalizedText = { en: "Sign in", fil: "Mag-sign in" };

type Step =
  | { name: "email" }
  | { name: "answers"; questions: [RecoveryQuestion, RecoveryQuestion] }
  | { name: "done" };

/** Password recovery by security questions, for residents with a password account. */
export function ForgotPasswordPanel() {
  const { lang } = useLanguage();
  const [step, setStep] = useState<Step>({ name: "email" });
  const [email, setEmail] = useState("");
  const [answer1, setAnswer1] = useState("");
  const [answer2, setAnswer2] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadQuestions() {
    setPending(true);
    setError(null);
    const { getRecoveryQuestions } = await import("@/app/actions/recovery");
    const result = await getRecoveryQuestions(email);
    setPending(false);
    if (result.ok) setStep({ name: "answers", questions: result.questions });
    else setError(result.error);
  }

  async function resetPassword() {
    setPending(true);
    setError(null);
    const { resetPasswordWithAnswers } = await import("@/app/actions/recovery");
    const result = await resetPasswordWithAnswers({ email, answer1, answer2, password });
    setPending(false);
    if (result.ok) setStep({ name: "done" });
    else setError(result.error);
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-lg">{t(TITLE, lang)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {step.name === "email" && (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void loadQuestions();
            }}
          >
            <p lang={lang} className="text-sm text-muted-foreground">
              {t(EMAIL_STEP, lang)}
            </p>
            <div className="space-y-1">
              <Label htmlFor="forgot-email">{t(EMAIL_LABEL, lang)}</Label>
              <Input
                id="forgot-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={pending}
              />
            </div>
            <Button type="submit" size="lg" className="w-full" loading={pending}>
              {t(NEXT, lang)}
            </Button>
            <p lang={lang} className="text-xs text-muted-foreground">
              {t(OFFICIALS_NOTE, lang)}
            </p>
          </form>
        )}

        {step.name === "answers" && (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void resetPassword();
            }}
          >
            {step.questions.map((question, index) => (
              <div key={question} className="space-y-1">
                <Label htmlFor={`forgot-answer-${index + 1}`}>{t(RECOVERY_QUESTIONS[question], lang)}</Label>
                <Input
                  id={`forgot-answer-${index + 1}`}
                  required
                  autoComplete="off"
                  inputMode={question === "mobile_number" ? "tel" : undefined}
                  value={index === 0 ? answer1 : answer2}
                  onChange={(event) => (index === 0 ? setAnswer1 : setAnswer2)(event.target.value)}
                  disabled={pending}
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="forgot-password">{t(NEW_PASSWORD, lang)}</Label>
              <Input
                id="forgot-password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={pending}
              />
            </div>
            <Button type="submit" size="lg" className="w-full" loading={pending}>
              {t(SET_PASSWORD, lang)}
            </Button>
          </form>
        )}

        {step.name === "done" && (
          <div className="space-y-3">
            <p role="status" lang={lang} className="text-sm text-green-500">
              {t(DONE, lang)}
            </p>
            <Button asChild size="lg" className="w-full">
              <Link href="/sign-in">{t(SIGN_IN, lang)}</Link>
            </Button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {friendlyError(error, lang)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

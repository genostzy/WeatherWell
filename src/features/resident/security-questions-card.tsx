"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EMPTY_RECOVERY_ANSWERS, RecoveryQuestionFields, type RecoveryAnswers } from "@/features/auth/recovery-question-fields";
import { useLanguage } from "@/features/i18n/language-provider";
import { getBrowserClient } from "@/lib/supabase/browser";
import { friendlyError } from "@/lib/friendly-error";
import { t } from "@/lib/i18n";
import { isRecoveryQuestion, recoveryAnswersProblem, RECOVERY_QUESTIONS, type RecoveryQuestion } from "@/lib/recovery-questions";
import type { LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = { en: "Security questions", fil: "Mga tanong pangseguridad" };
const NOT_SET: LocalizedText = {
  en: "Not set. Without them, a forgotten password cannot be reset.",
  fil: "Wala pa. Kung wala ang mga ito, hindi mare-reset ang nakalimutang password.",
};
const CURRENT: LocalizedText = { en: "Your questions:", fil: "Ang iyong mga tanong:" };
const SAVE: LocalizedText = { en: "Save questions", fil: "I-save ang mga tanong" };
const SAVED: LocalizedText = { en: "Saved.", fil: "Na-save." };

/** Sets or changes a resident's two security questions, for resetting a forgotten password. */
export function SecurityQuestionsCard() {
  const { lang } = useLanguage();
  const [current, setCurrent] = useState<[RecoveryQuestion, RecoveryQuestion] | null>(null);
  const [answers, setAnswers] = useState<RecoveryAnswers>(EMPTY_RECOVERY_ANSWERS);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<LocalizedText | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void getBrowserClient()
      .rpc("my_recovery_questions")
      .then(({ data }) => {
        const row = data?.[0];
        if (row && isRecoveryQuestion(row.question_1) && isRecoveryQuestion(row.question_2)) {
          setCurrent([row.question_1, row.question_2]);
        }
      });
  }, []);

  async function save() {
    setSaved(false);
    setError(null);
    const found = recoveryAnswersProblem(answers);
    setProblem(found);
    if (found) return;

    setPending(true);
    const { setRecoveryAnswers } = await import("@/app/actions/recovery");
    const result = await setRecoveryAnswers(answers);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCurrent([answers.question1, answers.question2]);
    setAnswers(EMPTY_RECOVERY_ANSWERS);
    setSaved(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t(TITLE, lang)}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <p lang={lang} className="text-sm text-muted-foreground">
            {current
              ? `${t(CURRENT, lang)} ${t(RECOVERY_QUESTIONS[current[0]], lang)} ${t(RECOVERY_QUESTIONS[current[1]], lang)}`
              : t(NOT_SET, lang)}
          </p>
          <RecoveryQuestionFields value={answers} onChange={setAnswers} disabled={pending} lang={lang} />
          <Button type="submit" size="sm" loading={pending}>
            {t(SAVE, lang)}
          </Button>
          {problem && (
            <p role="alert" lang={lang} className="text-sm text-destructive">
              {t(problem, lang)}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {friendlyError(error, lang)}
            </p>
          )}
          {saved && (
            <p role="status" lang={lang} className="text-sm text-green-500">
              {t(SAVED, lang)}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";
import { RECOVERY_QUESTION_KEYS, RECOVERY_QUESTIONS, type RecoveryQuestion } from "@/lib/recovery-questions";
import type { LanguageCode, LocalizedText } from "@/lib/types";

export interface RecoveryAnswers {
  question1: RecoveryQuestion;
  answer1: string;
  question2: RecoveryQuestion;
  answer2: string;
}

export const EMPTY_RECOVERY_ANSWERS: RecoveryAnswers = {
  question1: "favorite_food",
  answer1: "",
  question2: "mobile_number",
  answer2: "",
};

const QUESTION_LABEL: LocalizedText = { en: "Question {n}", fil: "Tanong {n}" };
const ANSWER_LABEL: LocalizedText = { en: "Answer {n}", fil: "Sagot {n}" };

/** Two security questions, each picked from the list and never the same one twice. */
export function RecoveryQuestionFields({
  value,
  onChange,
  disabled,
  lang,
}: {
  value: RecoveryAnswers;
  onChange: (value: RecoveryAnswers) => void;
  disabled?: boolean;
  lang: LanguageCode;
}) {
  const id = useId();
  const rows = [
    { n: 1, question: value.question1, answer: value.answer1, other: value.question2 },
    { n: 2, question: value.question2, answer: value.answer2, other: value.question1 },
  ] as const;

  return (
    <div className="space-y-3">
      {rows.map(({ n, question, answer, other }) => (
        <div key={n} className="space-y-1">
          <Label htmlFor={`${id}-q${n}`}>{t(QUESTION_LABEL, lang).replace("{n}", String(n))}</Label>
          <select
            id={`${id}-q${n}`}
            value={question}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...value, [`question${n}`]: event.target.value as RecoveryQuestion })
            }
            className="h-11 w-full rounded-md border-2 border-border bg-background px-3 text-sm"
          >
            {RECOVERY_QUESTION_KEYS.map((key) => (
              <option key={key} value={key} disabled={key === other}>
                {t(RECOVERY_QUESTIONS[key], lang)}
              </option>
            ))}
          </select>
          <Label htmlFor={`${id}-a${n}`} className="sr-only">
            {t(ANSWER_LABEL, lang).replace("{n}", String(n))}
          </Label>
          <Input
            id={`${id}-a${n}`}
            required
            minLength={2}
            autoComplete="off"
            inputMode={question === "mobile_number" ? "tel" : undefined}
            value={answer}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, [`answer${n}`]: event.target.value })}
          />
        </div>
      ))}
    </div>
  );
}

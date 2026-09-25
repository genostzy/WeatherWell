import type { LocalizedText } from "./types";

/**
 * The security questions a resident can pick from. The keys must match
 * private.recovery_question_keys() (password_recovery_and_email_alerts).
 */
export const RECOVERY_QUESTIONS = {
  favorite_food: { en: "What is your favorite food?", fil: "Ano ang paborito mong pagkain?" },
  mobile_number: { en: "What is your mobile number?", fil: "Ano ang iyong mobile number?" },
  first_school: { en: "What was the name of your first school?", fil: "Ano ang pangalan ng una mong paaralan?" },
  birth_town: { en: "In what town were you born?", fil: "Saang bayan ka ipinanganak?" },
  first_pet: { en: "What was the name of your first pet?", fil: "Ano ang pangalan ng una mong alagang hayop?" },
} satisfies Record<string, LocalizedText>;

export type RecoveryQuestion = keyof typeof RECOVERY_QUESTIONS;

export const RECOVERY_QUESTION_KEYS = Object.keys(RECOVERY_QUESTIONS) as RecoveryQuestion[];

export function isRecoveryQuestion(value: string): value is RecoveryQuestion {
  return Object.hasOwn(RECOVERY_QUESTIONS, value);
}

/** The database's own rules for answers, checked before an account is made so it is not left without them. */
export function recoveryAnswersProblem(answers: {
  question1: RecoveryQuestion;
  answer1: string;
  question2: RecoveryQuestion;
  answer2: string;
}): LocalizedText | null {
  if (answers.question1 === answers.question2) {
    return { en: "Pick two different questions.", fil: "Pumili ng dalawang magkaibang tanong." };
  }
  const pairs = [
    [answers.question1, answers.answer1],
    [answers.question2, answers.answer2],
  ] as const;
  for (const [question, answer] of pairs) {
    if (question === "mobile_number" && answer.replace(/\D/g, "").length < 10) {
      return {
        en: "Enter the whole mobile number, like 0917 123 4567.",
        fil: "Ilagay ang buong mobile number, gaya ng 0917 123 4567.",
      };
    }
    if (answer.trim().length < 2) {
      return { en: "Each answer needs at least 2 characters.", fil: "Kailangan ng hindi bababa sa 2 titik ang bawat sagot." };
    }
  }
  return null;
}

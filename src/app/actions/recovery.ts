"use server";

import { createClient } from "@supabase/supabase-js";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { isRecoveryQuestion, type RecoveryQuestion } from "@/lib/recovery-questions";
import type { ActionResult } from "./action-result";

/** Supabase Auth's own minimum; the sign-up form asks for the same. */
const MIN_PASSWORD_LENGTH = 6;

const NO_SESSION: ActionResult = { ok: false, permanent: true, error: "No session — sign in and try again." };
const NO_MATCH = "Those answers don't match.";

const service = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function failure(error: { message?: string; code?: string }): ActionResult {
  return { ok: false, permanent: true, error: error.message ?? `Database error ${error.code ?? "(no code)"}` };
}

function plausibleEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export interface RecoveryAnswersInput {
  question1: string;
  answer1: string;
  question2: string;
  answer2: string;
}

/** A resident sets or changes their two security questions. The database checks and hashes the answers. */
export async function setRecoveryAnswers(input: RecoveryAnswersInput): Promise<ActionResult> {
  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NO_SESSION;

  const { error } = await supabase.rpc("set_recovery_answers", {
    p_question_1: input.question1,
    p_answer_1: input.answer1,
    p_question_2: input.question2,
    p_answer_2: input.answer2,
  });
  return error ? failure(error) : { ok: true };
}

export type RecoveryQuestionsResult =
  | { ok: true; questions: [RecoveryQuestion, RecoveryQuestion] }
  | { ok: false; error: string };

/**
 * The two questions to answer for an email. An email with no account gets
 * two questions all the same (chosen by the database), so this cannot be
 * used to find out who has an account.
 */
export async function getRecoveryQuestions(email: string): Promise<RecoveryQuestionsResult> {
  if (!plausibleEmail(email)) return { ok: false, error: "Enter the email you signed up with." };

  const { data, error } = await service().rpc("recovery_questions_for", { p_email: email });
  const row = data?.[0];
  if (error || !row || !isRecoveryQuestion(row.question_1) || !isRecoveryQuestion(row.question_2)) {
    return { ok: false, error: error?.message ?? "Could not load the questions. Try again." };
  }
  return { ok: true, questions: [row.question_1, row.question_2] };
}

export interface ResetWithAnswersInput {
  email: string;
  answer1: string;
  answer2: string;
  password: string;
}

/**
 * Sets a new password once both answers match. Residents only: the database
 * never matches an official's or an admin's account (they reset through an
 * admin), and locks an email for an hour after five wrong tries.
 */
export async function resetPasswordWithAnswers(input: ResetWithAnswersInput): Promise<ActionResult> {
  if (!plausibleEmail(input.email)) return { ok: false, permanent: true, error: "Enter the email you signed up with." };
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, permanent: true, error: `Use at least ${MIN_PASSWORD_LENGTH} characters for the new password.` };
  }

  const supabase = service();
  const { data: userId, error } = await supabase.rpc("verify_recovery_answers", {
    p_email: input.email,
    p_answer_1: input.answer1,
    p_answer_2: input.answer2,
  });
  if (error) return failure(error);
  if (!userId) return { ok: false, permanent: true, error: NO_MATCH };

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password: input.password });
  return updateError ? failure(updateError) : { ok: true };
}

/** An admin sets a new password for an official. The database decides who may, and records it. */
export async function resetOfficialPassword(input: { email: string; password: string }): Promise<ActionResult> {
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, permanent: true, error: `Use at least ${MIN_PASSWORD_LENGTH} characters for the new password.` };
  }

  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NO_SESSION;

  const { data: officialId, error } = await supabase.rpc("admin_authorize_password_reset", { p_email: input.email });
  if (error) return failure(error);
  if (!officialId) return { ok: false, permanent: true, error: "No official has that email." };

  const { error: updateError } = await service().auth.admin.updateUserById(officialId, { password: input.password });
  return updateError ? failure(updateError) : { ok: true };
}

import { clearOutbox } from "@/lib/outbox/outbox";
import { forgetOnboarding } from "@/features/onboarding/onboarding-storage";

/**
 * After a resident deletes their data, this phone starts again: nothing
 * queued under the deleted account is sent, and onboarding asks for consent
 * and a barangay afresh.
 */
export async function forgetThisPhone(userId: string): Promise<void> {
  await clearOutbox(userId);
  forgetOnboarding();
}

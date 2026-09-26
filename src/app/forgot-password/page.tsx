import type { Metadata } from "next";
import { ForgotPasswordPanel } from "@/features/auth/forgot-password-panel";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4 sm:p-6 lg:p-8">
      <ForgotPasswordPanel />
    </main>
  );
}

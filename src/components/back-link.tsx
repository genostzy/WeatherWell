import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Every screen other than the home alert screen needs a visible way back to
 * it — the app is a PWA, so there is no browser chrome to rely on.
 */
export function BackLink({ className = "max-w-md" }: { className?: string }) {
  return (
    <div className={`w-full ${className}`}>
      <Button asChild variant="ghost" size="lg">
        <Link href="/">
          <ArrowLeft aria-hidden="true" />
          Back to alerts
        </Link>
      </Button>
    </div>
  );
}

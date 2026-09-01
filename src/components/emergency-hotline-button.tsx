import { Phone } from "lucide-react";

export function EmergencyHotlineButton({ hotlineNumber }: { hotlineNumber: string }) {
  return (
    <a
      href={`tel:${hotlineNumber}`}
      aria-label="Call emergency hotline"
      className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-severity-red text-white shadow-lg"
    >
      <Phone className="h-6 w-6" aria-hidden="true" />
    </a>
  );
}

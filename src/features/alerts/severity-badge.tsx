import { Badge } from "@/components/ui/badge";
import { SEVERITY_LABEL, SEVERITY_BADGE_CLASS, type Severity } from "@/lib/severity";

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <Badge className={SEVERITY_BADGE_CLASS[severity]}>{SEVERITY_LABEL[severity]}</Badge>
  );
}

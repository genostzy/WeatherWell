"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DepthReferenceVisual } from "./depth-reference-visual";
import { DEPTH_LEVELS, DEPTH_LABEL, type DepthLevel } from "@/lib/depth";

export function ReportForm({
  zoneId,
  onSubmit,
}: {
  zoneId: string;
  onSubmit: (depthLevel: DepthLevel) => void;
}) {
  const [depthLevel, setDepthLevel] = useState<DepthLevel>("dry");
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      className="flex w-full max-w-md flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        // Optimistic: flip the button state and call onSubmit synchronously,
        // on the assumption the write succeeds — Phase 3 reconciles this
        // against the real Server Action result instead of a blocking wait.
        setSubmitting(true);
        onSubmit(depthLevel);
      }}
    >
      <input type="hidden" name="zoneId" value={zoneId} />

      <DepthReferenceVisual depthLevel={depthLevel} />

      <RadioGroup
        value={depthLevel}
        onValueChange={(value) => setDepthLevel(value as DepthLevel)}
        aria-label="How deep is the water?"
      >
        {DEPTH_LEVELS.map((level) => (
          <div key={level} className="flex items-center space-x-3 py-2">
            <RadioGroupItem value={level} id={`depth-${level}`} disabled={submitting} />
            <Label htmlFor={`depth-${level}`} className="text-base">
              {DEPTH_LABEL[level]}
            </Label>
          </div>
        ))}
      </RadioGroup>

      <Button type="submit" size="lg" disabled={submitting}>
        Submit report
      </Button>
    </form>
  );
}

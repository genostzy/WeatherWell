"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OverlayDialog } from "./overlay-dialog";

/**
 * A one-step "are you sure" for an irreversible action initiated by the
 * person it affects — as opposed to admin's pin removal, which is a
 * soft-delete with its own Restore action and so doesn't need this.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  closeLabel,
  onConfirm,
  onCancel,
  destructive = true,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Label for the corner X — kept distinct from cancelLabel so the two controls don't share one accessible name. */
  closeLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}) {
  return (
    <OverlayDialog onClose={onCancel} label={title} closeLabel={closeLabel} className="max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle className="pr-8 text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{body}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={destructive ? "outline" : "default"}
              className={destructive ? "border-severity-red text-severity-red" : undefined}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              {cancelLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </OverlayDialog>
  );
}

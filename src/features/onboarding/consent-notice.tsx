"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ConsentNotice({ onAccept }: { onAccept: () => void }) {
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Before you continue</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p>
          WeatherWell asks for your location to match you to your barangay zone and to
          confirm water-level reports come from where you say they do. It is not stored
          beyond validating a report.
        </p>
        <p>
          WeatherWell also asks for your phone number so it can send SMS alerts if your
          internet connection drops. It is stored securely and never shared.
        </p>
        <p>You can decline either and still see public alerts for your area.</p>
        <p className="text-muted-foreground">
          Collected under the Data Privacy Act of 2012 (RA 10173) with your consent.
        </p>
        <Button onClick={onAccept} className="w-full" size="lg">
          I understand
        </Button>
      </CardContent>
    </Card>
  );
}

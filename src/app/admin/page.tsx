"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bell,
  MessageSquare,
  CheckCircle2,
  Smartphone,
  Wifi,
  WifiOff,
  Play,
  RotateCcw,
} from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { SEVERITY_HEX } from "@/lib/severity";
import {
  MOCK_ZONES,
  MOCK_SCENARIOS,
  getPredictionsForZone,
  MOCK_CASCADES,
} from "@/lib/mock-data";
import type { Zone, PredictionStep } from "@/lib/types";

type SimulationStep =
  | "idle"
  | "predicting"
  | "alert-issued"
  | "push-sent"
  | "push-failed"
  | "sms-sent"
  | "cached"
  | "cascade"
  | "complete";

const STEP_EXPLANATION = {
  en: {
    predicting: "The prediction engine analyzes rainfall, terrain, and tidal data to estimate flood risk.",
    "alert-issued": "Alert auto-triggered based on crowd reports and prediction thresholds.",
    "push-sent": "Push notification delivered to all subscribed devices in the zone.",
    "push-failed": "Push delivery failed — retrying once after 60 seconds.",
    "sms-sent": "SMS fallback sent to residents whose push failed (mock in Phase 1).",
    cached: "Alert cached locally on each device for offline access.",
    cascade: "Upstream flooding detected — early warning sent to downstream zones.",
    complete: "Simulation complete. All delivery channels demonstrated.",
  },
  fil: {
    predicting: "Ang prediction engine ay nagsusuri ng ulan, lupa, at tidal data para tantyahin ang panganib ng baha.",
    "alert-issued": "Auto-triggered alert batay sa crowd reports at prediction thresholds.",
    "push-sent": "Push notification na-deliver sa lahat ng subscribed devices sa zone.",
    "push-failed": "Push delivery nabigo — ni-retry pagkatapos ng 60 segundo.",
    "sms-sent": "SMS fallback na-send sa mga resident na nabigo ang push (mock sa Phase 1).",
    cached: "Alert naka-cache sa bawat device para sa offline access.",
    cascade: "May baha sa itaas — early warning na-send sa downstream zones.",
    complete: "Simulation tapos na. Lahat ng delivery channels na-demonstrate.",
  },
};

export default function AdminPage() {
  const { lang } = useLanguage();
  const [selectedZone, setSelectedZone] = useState<Zone>(MOCK_ZONES[0]);
  const [selectedScenario, setSelectedScenario] = useState(MOCK_SCENARIOS[0].id);
  const [currentStep, setCurrentStep] = useState<SimulationStep>("idle");
  const [stepHistory, setStepHistory] = useState<SimulationStep[]>([]);

  const predictions = getPredictionsForZone(selectedZone.id);
  const cascade = MOCK_CASCADES.find((c) => c.fromZoneId === selectedZone.id);

  const runSimulation = () => {
    setCurrentStep("predicting");
    setStepHistory(["predicting"]);

    setTimeout(() => {
      setCurrentStep("alert-issued");
      setStepHistory((prev) => [...prev, "alert-issued"]);

      setTimeout(() => {
        setCurrentStep("push-sent");
        setStepHistory((prev) => [...prev, "push-sent"]);

        setTimeout(() => {
          setCurrentStep("push-failed");
          setStepHistory((prev) => [...prev, "push-failed"]);

          setTimeout(() => {
            setCurrentStep("sms-sent");
            setStepHistory((prev) => [...prev, "sms-sent"]);

            setTimeout(() => {
              setCurrentStep("cached");
              setStepHistory((prev) => [...prev, "cached"]);

              setTimeout(() => {
                if (cascade) {
                  setCurrentStep("cascade");
                  setStepHistory((prev) => [...prev, "cascade"]);
                }

                setTimeout(() => {
                  setCurrentStep("complete");
                  setStepHistory((prev) => [...prev, "complete"]);
                }, 1500);
              }, 1500);
            }, 1500);
          }, 1500);
        }, 2000);
      }, 1500);
    }, 1500);
  };

  const resetSimulation = () => {
    setCurrentStep("idle");
    setStepHistory([]);
  };

  const StepIndicator = ({
    step,
    label,
    icon: Icon,
  }: {
    step: SimulationStep;
    label: string;
    icon: React.ElementType;
  }) => {
    const isActive = currentStep === step;
    const isDone = stepHistory.indexOf(step) < stepHistory.indexOf(currentStep) ||
      (currentStep === "complete" && stepHistory.includes(step));

    return (
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
            isActive
              ? "border-severity-orange bg-severity-orange/20"
              : isDone
              ? "border-green-500 bg-green-500/20"
              : "border-muted-foreground/30"
          }`}
        >
          <Icon
            className={`h-4 w-4 ${
              isActive
                ? "text-severity-orange"
                : isDone
                ? "text-green-500"
                : "text-muted-foreground"
            }`}
          />
        </div>
        <span
          className={`text-sm ${
            isActive
              ? "font-medium text-severity-orange"
              : isDone
              ? "text-green-500"
              : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
        {isDone && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        {isActive && step === "push-failed" && (
          <Badge variant="outline" className="text-xs text-yellow-500">
            Retry in 60s
          </Badge>
        )}
      </div>
    );
  };

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">
            {lang === "fil" ? "Admin Simulation" : "Admin Simulation"}
          </h1>
          <p className="text-muted-foreground">
            {lang === "fil"
              ? "Subukan ang alert flow para sa pagsasanay"
              : "Test the alert flow for training and demo"}
          </p>
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {lang === "fil" ? "Zone" : "Zone"}
            </label>
            <Select
              value={selectedZone.id}
              onValueChange={(v) => {
                setSelectedZone(MOCK_ZONES.find((z) => z.id === v) || MOCK_ZONES[0]);
                resetSimulation();
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOCK_ZONES.map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {zone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {lang === "fil" ? "Senaryo" : "Scenario"}
            </label>
            <Select
              value={selectedScenario}
              onValueChange={(v) => {
                setSelectedScenario(v);
                resetSimulation();
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOCK_SCENARIOS.map((scenario) => (
                  <SelectItem key={scenario.id} value={scenario.id}>
                    {t(scenario.name, lang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>📋</span>
              <span>{t(MOCK_SCENARIOS.find((s) => s.id === selectedScenario)!.name, lang)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p lang={lang} className="text-muted-foreground">
              {t(
                MOCK_SCENARIOS.find((s) => s.id === selectedScenario)!.description,
                lang
              )}
            </p>
          </CardContent>
        </Card>

        {predictions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>🌊</span>
                <span>{lang === "fil" ? "Prediksyon" : "Prediction Timeline"}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1">
                {predictions.map((step, i) => (
                  <div key={i} className="flex items-center">
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className="h-4 w-4 rounded-full border-2"
                        style={{
                          backgroundColor: SEVERITY_HEX[step.severity],
                          borderColor: SEVERITY_HEX[step.severity],
                        }}
                      />
                      <span className="text-xs font-medium">{step.timing}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {t(step.label, lang)}
                      </span>
                    </div>
                    {i < predictions.length - 1 && (
                      <div className="mx-1 h-0.5 w-8 bg-muted-foreground/30" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Separator />

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            {lang === "fil" ? "Daloy ng Alert" : "Alert Flow"}
          </h2>

          <div className="space-y-3">
            <StepIndicator
              step="predicting"
              label={lang === "fil" ? "Prediksyon" : "Prediction"}
              icon={Wifi}
            />
            <StepIndicator
              step="alert-issued"
              label={lang === "fil" ? "Alert Na-issue" : "Alert Issued"}
              icon={Bell}
            />
            <StepIndicator
              step="push-sent"
              label={lang === "fil" ? "Push Notification" : "Push Notification"}
              icon={Smartphone}
            />
            <StepIndicator
              step="push-failed"
              label={lang === "fil" ? "Push Nabigo" : "Push Failed"}
              icon={WifiOff}
            />
            <StepIndicator
              step="sms-sent"
              label="SMS (mock)"
              icon={MessageSquare}
            />
            <StepIndicator
              step="cached"
              label={lang === "fil" ? "Naka-cache" : "Cached Offline"}
              icon={CheckCircle2}
            />
            {cascade && (
              <StepIndicator
                step="cascade"
                label={lang === "fil" ? "Cascade Warning" : "Cascade Warning"}
                icon={AlertTriangle}
              />
            )}
          </div>

          {currentStep !== "idle" && (
            <Card className="border-severity-orange/30">
              <CardContent className="pt-6">
                <p lang={lang} className="text-sm">
                  {STEP_EXPLANATION[lang][currentStep]}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex gap-3">
          <Button
            onClick={runSimulation}
            disabled={currentStep !== "idle" && currentStep !== "complete"}
            className="gap-2"
          >
            <Play className="h-4 w-4" />
            {currentStep === "complete"
              ? lang === "fil"
                ? "Muli"
                : "Run Again"
              : lang === "fil"
              ? "Simulan"
              : "Start Simulation"}
          </Button>
          {currentStep !== "idle" && (
            <Button variant="outline" onClick={resetSimulation} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              {lang === "fil" ? "I-reset" : "Reset"}
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}

function AlertTriangle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

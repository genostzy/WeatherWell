"use client";

import { useState } from "react";
import Link from "next/link";
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
  ArrowLeft,
  Bell,
  MessageSquare,
  CheckCircle2,
  Smartphone,
  Wifi,
  WifiOff,
  Play,
  RotateCcw,
  AlertTriangle,
  ClipboardList,
} from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { PredictionTimeline } from "@/features/alerts/prediction-timeline";
import { MOCK_ZONES, MOCK_SCENARIOS, getPredictionsForZone, MOCK_CASCADES } from "@/lib/mock-data";
import type { LocalizedText, Zone } from "@/lib/types";

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

type IndicatorStep = Exclude<SimulationStep, "idle" | "complete">;

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

const STEP_LABEL: Record<IndicatorStep, LocalizedText> = {
  predicting: { en: "Prediction", fil: "Prediksyon" },
  "alert-issued": { en: "Alert Issued", fil: "Alert Na-issue" },
  "push-sent": { en: "Push Notification", fil: "Push Notification" },
  "push-failed": { en: "Push Failed", fil: "Push Nabigo" },
  "sms-sent": { en: "SMS (mock)", fil: "SMS (mock)" },
  cached: { en: "Cached Offline", fil: "Naka-cache" },
  cascade: { en: "Cascade Warning", fil: "Cascade Warning" },
};

const PAGE_TITLE: LocalizedText = { en: "Alert Flow Simulation", fil: "Simulation ng Alert Flow" };
const SUBTITLE: LocalizedText = {
  en: "Run a full alert flow end to end — training and demo only, no residents are notified",
  fil: "Patakbuhin ang buong alert flow — pagsasanay at demo lang, walang residenteng aabisuhan",
};
const BACK_TO_DASHBOARD: LocalizedText = { en: "Back to admin dashboard", fil: "Balik sa admin dashboard" };
const ZONE_LABEL: LocalizedText = { en: "Zone", fil: "Zone" };
const SCENARIO_LABEL: LocalizedText = { en: "Scenario", fil: "Senaryo" };
const ALERT_FLOW: LocalizedText = { en: "Alert Flow", fil: "Daloy ng Alert" };
const RETRY_IN_60S: LocalizedText = { en: "Retry in 60s", fil: "Ulitin sa loob ng 60s" };
const RUN_AGAIN: LocalizedText = { en: "Run Again", fil: "Muli" };
const START_SIMULATION: LocalizedText = { en: "Start Simulation", fil: "Simulan" };
const RESET: LocalizedText = { en: "Reset", fil: "I-reset" };
const DRILL_NOTE: LocalizedText = {
  en: "Nothing here reaches a real resident — this is the PRD's drill mode, unauthenticated in Phase 1 and PIN-protected from Phase 2.",
  fil: "Walang umaabot sa totoong residente — ito ang drill mode ng PRD, walang PIN sa Phase 1.",
};

function isStepDone(
  step: SimulationStep,
  currentStep: SimulationStep,
  stepHistory: SimulationStep[]
): boolean {
  return (
    stepHistory.indexOf(step) < stepHistory.indexOf(currentStep) ||
    (currentStep === "complete" && stepHistory.includes(step))
  );
}

function StepIndicator({
  label,
  icon: Icon,
  isActive,
  isDone,
  retryBadge,
}: {
  label: string;
  icon: React.ElementType;
  isActive: boolean;
  isDone: boolean;
  retryBadge?: string;
}) {
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
            isActive ? "text-severity-orange" : isDone ? "text-green-500" : "text-muted-foreground"
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
      {isActive && retryBadge && (
        <Badge variant="outline" className="text-xs text-yellow-500">
          {retryBadge}
        </Badge>
      )}
    </div>
  );
}

export default function AdminSimulationPage() {
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

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-2xl space-y-6 lg:max-w-4xl">
        <Button asChild variant="ghost" size="lg" className="-ml-3">
          <Link href="/admin">
            <ArrowLeft aria-hidden="true" />
            {t(BACK_TO_DASHBOARD, lang)}
          </Link>
        </Button>

        <div>
          <h1 className="text-2xl font-bold">{t(PAGE_TITLE, lang)}</h1>
          <p className="text-muted-foreground">{t(SUBTITLE, lang)}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="admin-zone-select" className="text-sm font-medium">
              {t(ZONE_LABEL, lang)}
            </label>
            <Select
              value={selectedZone.id}
              onValueChange={(v) => {
                setSelectedZone(MOCK_ZONES.find((z) => z.id === v) || MOCK_ZONES[0]);
                resetSimulation();
              }}
            >
              <SelectTrigger id="admin-zone-select">
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
            <label htmlFor="admin-scenario-select" className="text-sm font-medium">
              {t(SCENARIO_LABEL, lang)}
            </label>
            <Select
              value={selectedScenario}
              onValueChange={(v) => {
                setSelectedScenario(v);
                resetSimulation();
              }}
            >
              <SelectTrigger id="admin-scenario-select">
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
              <ClipboardList aria-hidden="true" className="h-5 w-5" />
              <span>{t(MOCK_SCENARIOS.find((s) => s.id === selectedScenario)!.name, lang)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p lang={lang} className="text-muted-foreground">
              {t(MOCK_SCENARIOS.find((s) => s.id === selectedScenario)!.description, lang)}
            </p>
          </CardContent>
        </Card>

        {predictions.length > 0 && (
          <PredictionTimeline steps={predictions} zoneName={selectedZone.name} />
        )}

        <Separator />

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t(ALERT_FLOW, lang)}</h2>

          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:gap-x-6 lg:gap-y-3">
            <StepIndicator
              label={t(STEP_LABEL.predicting, lang)}
              icon={Wifi}
              isActive={currentStep === "predicting"}
              isDone={isStepDone("predicting", currentStep, stepHistory)}
            />
            <StepIndicator
              label={t(STEP_LABEL["alert-issued"], lang)}
              icon={Bell}
              isActive={currentStep === "alert-issued"}
              isDone={isStepDone("alert-issued", currentStep, stepHistory)}
            />
            <StepIndicator
              label={t(STEP_LABEL["push-sent"], lang)}
              icon={Smartphone}
              isActive={currentStep === "push-sent"}
              isDone={isStepDone("push-sent", currentStep, stepHistory)}
            />
            <StepIndicator
              label={t(STEP_LABEL["push-failed"], lang)}
              icon={WifiOff}
              isActive={currentStep === "push-failed"}
              isDone={isStepDone("push-failed", currentStep, stepHistory)}
              retryBadge={t(RETRY_IN_60S, lang)}
            />
            <StepIndicator
              label={t(STEP_LABEL["sms-sent"], lang)}
              icon={MessageSquare}
              isActive={currentStep === "sms-sent"}
              isDone={isStepDone("sms-sent", currentStep, stepHistory)}
            />
            <StepIndicator
              label={t(STEP_LABEL.cached, lang)}
              icon={CheckCircle2}
              isActive={currentStep === "cached"}
              isDone={isStepDone("cached", currentStep, stepHistory)}
            />
            {cascade && (
              <StepIndicator
                label={t(STEP_LABEL.cascade, lang)}
                icon={AlertTriangle}
                isActive={currentStep === "cascade"}
                isDone={isStepDone("cascade", currentStep, stepHistory)}
              />
            )}
          </div>

          {currentStep !== "idle" && (
            <Card className="border-severity-orange/30">
              <CardContent>
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
            {currentStep === "complete" ? t(RUN_AGAIN, lang) : t(START_SIMULATION, lang)}
          </Button>
          {currentStep !== "idle" && (
            <Button variant="outline" onClick={resetSimulation} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              {t(RESET, lang)}
            </Button>
          )}
        </div>

        <p lang={lang} className="text-xs text-muted-foreground">
          {t(DRILL_NOTE, lang)}
        </p>
      </div>
    </main>
  );
}

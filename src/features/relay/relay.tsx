"use client";

import { useState, useSyncExternalStore } from "react";
import { MessageSquareText, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { buildShareText, toSharedAlert } from "@/lib/alert-share/payload";
import {
  buildRelaySmsHref,
  loadRelayContacts,
  saveRelayContacts,
  MAX_RELAY_CONTACTS,
  type RelayContact,
} from "@/lib/relay-contacts";
import type { AlertRecord, LocalizedText, Zone } from "@/lib/types";

const TITLE: LocalizedText = { en: "Neighbours to text", fil: "Mga kapitbahay na ite-text" };
const HINT: LocalizedText = {
  en: "Up to 5 people without the app — an elderly relative, a neighbour. Saved on this phone only. When an alert comes, one tap texts them all.",
  fil: "Hanggang 5 taong walang app — matandang kamag-anak, kapitbahay. Sa teleponong ito lang naka-save. Pag may alerto, isang pindot lang para ma-text silang lahat.",
};
const NAME: LocalizedText = { en: "Name", fil: "Pangalan" };
const NUMBER: LocalizedText = { en: "Mobile number", fil: "Numero ng mobile" };
const ADD: LocalizedText = { en: "Add", fil: "Idagdag" };
const REMOVE: LocalizedText = { en: "Remove", fil: "Alisin" };
const SET_UP: LocalizedText = { en: "Set up texting your neighbours", fil: "I-set up ang pag-text sa mga kapitbahay" };

// Re-read after this tab writes, and when another tab does.
const CHANGED = "weatherwell:relay-contacts";
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}
function snapshot() {
  try {
    return localStorage.getItem("weatherwell.relayContacts") ?? "[]";
  } catch {
    return "[]";
  }
}
function useRelayContacts(): RelayContact[] {
  // The raw string is the snapshot (stable between renders); parsing it is cheap.
  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  return raw === "[]" ? [] : loadRelayContacts();
}
function save(contacts: RelayContact[]) {
  saveRelayContacts(contacts);
  window.dispatchEvent(new Event(CHANGED));
}

/** Under an active alert: text the resident's saved contacts, or point them at setting that up. */
export function RelayButton({ alert, zone }: { alert: AlertRecord; zone: Zone }) {
  const { lang } = useLanguage();
  const contacts = useRelayContacts();

  if (contacts.length === 0) {
    return (
      <a href="/evacuation#relay" lang={lang} className="block text-xs underline underline-offset-2">
        {t(SET_UP, lang)}
      </a>
    );
  }

  const n = contacts.length;
  const label = lang === "fil" ? `I-text ang ${n} kapitbahay` : `Text ${n} ${n === 1 ? "neighbour" : "neighbours"}`;
  // Contacts live in this browser's storage, so this branch never renders on
  // the server and window is always there. Rebuilt on click too, so the
  // message's timestamp is current when it is sent.
  const href = () =>
    buildRelaySmsHref(
      contacts.map((c) => c.number),
      buildShareText(toSharedAlert(alert, zone, lang), window.location.origin, lang),
      navigator.userAgent
    );

  return (
    <Button asChild variant="outline" size="lg">
      <a href={href()} onClick={(e) => (e.currentTarget.href = href())}>
        <Users aria-hidden="true" className="h-4 w-4" />
        {label}
      </a>
    </Button>
  );
}

/** On the evacuation page: the list itself. */
export function RelayContactsEditor() {
  const { lang } = useLanguage();
  const contacts = useRelayContacts();
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");

  return (
    <Card id="relay" className="w-full scroll-mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareText aria-hidden="true" className="h-5 w-5" />
          <span lang={lang}>{t(TITLE, lang)}</span>
        </CardTitle>
        <p lang={lang} className="text-xs text-muted-foreground">
          {t(HINT, lang)}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {contacts.length > 0 && (
          <ul className="space-y-1">
            {contacts.map((c, i) => (
              <li key={`${c.number}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{c.name}</span>{" "}
                  <span className="text-muted-foreground">{c.number}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`${t(REMOVE, lang)} ${c.name}`}
                  onClick={() => save(contacts.filter((_, j) => j !== i))}
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {contacts.length < MAX_RELAY_CONTACTS && (
          <form
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (number.trim() === "") return;
              save([...contacts, { name: name.trim() || number.trim(), number: number.trim() }]);
              setName("");
              setNumber("");
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="relay-name">{t(NAME, lang)}</Label>
              <Input id="relay-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="relay-number">{t(NUMBER, lang)}</Label>
              <Input
                id="relay-number"
                type="tel"
                inputMode="tel"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                autoComplete="off"
              />
            </div>
            <Button type="submit" size="sm">
              {t(ADD, lang)}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

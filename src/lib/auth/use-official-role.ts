"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { areaLevel, type Official } from "./official";

export interface OfficialRole {
  level: Official["level"];
  areaCode: string;
  displayName: string;
}

type Session = { user: { id: string; is_anonymous?: boolean } } | null;

/**
 * Whether the account on this device is an official, for the resident screens
 * that link them to their dashboard. Presentation only: /admin's own gate
 * and the database decide what they can actually do.
 *
 * Like AccountLink, it only reads the session and never starts one. An
 * anonymous session is a resident by construction, so it is not looked up.
 */
export function useOfficialRole(): OfficialRole | null {
  const [role, setRole] = useState<OfficialRole | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = getBrowserClient();

    async function load(session: Session) {
      if (!session || session.user.is_anonymous) {
        if (active) setRole(null);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("role, area_code, display_name")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!active) return;
      if (data?.role === "admin") {
        setRole({ level: "admin", areaCode: "", displayName: data.display_name ?? "" });
      } else if (data?.role === "operator" && data.area_code) {
        setRole({ level: areaLevel(data.area_code), areaCode: data.area_code, displayName: data.display_name ?? "" });
      } else {
        setRole(null);
      }
    }

    void supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      void load(session);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return role;
}

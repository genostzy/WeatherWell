import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-session";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Static assets and images never carry a session, so refreshing on them is
  // pure latency on the degraded connections this app is built for.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/monitoring/report";

/** Reports crashes no error boundary sees: uncaught errors and rejected promises. */
export function ErrorReporter(): null {
  useEffect(() => {
    const route = () => window.location.pathname + window.location.search;
    const onError = (event: ErrorEvent) =>
      void reportError(event.error ?? event.message, { source: "client", kind: "unhandled", route: route() });
    const onRejection = (event: PromiseRejectionEvent) =>
      void reportError(event.reason, { source: "client", kind: "unhandled", route: route() });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}

import type { Instrumentation } from "next";
import { reportError } from "@/lib/monitoring/report";

export const onRequestError: Instrumentation.onRequestError = async (err, request) => {
  await reportError(err, { source: "server", kind: "request", route: request.path });
};

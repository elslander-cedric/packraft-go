import type { AccessState } from "@/core/access";
import type { AccessPointUse } from "@/core/accessPoints";

/** Put-ins and take-outs share the colours of the trip's put-in and take-out rings. */
export const accessUseColours: Record<AccessPointUse, string> = {
  "put-in": "#1a8f3a",
  "take-out": "#7a3fb5",
  both: "#0e7c86",
};

/** One colour per access status, shared by the map and its legend. Red is only for explicit bans. */
export const accessColours: Record<AccessState, string> = {
  open: "#1f9d55",
  "closed-today": "#e07b00",
  forbidden: "#d0021b",
  unknown: "#7a7a7a",
  checking: "#5b7a99", // Neutral and transient: the live flow is loading (#85).
};

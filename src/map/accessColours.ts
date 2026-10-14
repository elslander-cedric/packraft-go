import type { AccessState } from "@/core/access";

/** One colour per access status, shared by the map and its legend. Red is only for explicit bans. */
export const accessColours: Record<AccessState, string> = {
  open: "#1f9d55",
  "closed-today": "#e07b00",
  forbidden: "#d0021b",
  unknown: "#7a7a7a",
  checking: "#5b7a99", // Neutral and transient: the live flow is loading (#85).
};

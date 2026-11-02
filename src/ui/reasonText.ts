import type { AccessReason } from "@/core/access";
import type { OfficialClosedVerdict } from "@/core/officialStatus";
import { strings } from "./strings";

type RuleReason = Extract<AccessReason, { kind: "rule" }>;

/** Why the SPW closed a stretch, in words. */
function closedWhy({ cause, reason }: OfficialClosedVerdict): string {
  const text = strings.official;
  // Code 0 is "too low, or the reason given": the SPW's own words replace the default.
  if (cause === "too-low-or-stated") return reason ?? text.tooLow;
  return reason ? `${text.causes[cause]} ${reason}` : text.causes[cause];
}

function statusText({ official, ruleText, state, closedBy }: RuleReason): string {
  switch (official?.kind) {
    case "closed": {
      const closed = strings.official.closed(closedWhy(official));
      return closedBy === "official" ? closed : `${ruleText} ${closed}`;
    }
    case "open":
      if (state !== "open") return ruleText;
      return `${official.soon ? strings.official.openSoon : strings.official.open} ${ruleText}`;
    case "unrecognised":
      return state === "unknown" ? strings.official.unrecognised(official.code) : ruleText;
    case "none":
      return `${ruleText} ${strings.official.none}`;
    default:
      return ruleText;
  }
}

/**
 * Why a stretch has its status, in words: the rule text, with what the SPW says
 * today. The SPW's reason only ever comes with a closure (ADR 0035). On a future
 * date that is a note after the rule text (#212).
 */
export function reasonText(reason: RuleReason): string {
  const text = statusText(reason);
  return reason.closedToday ? `${text} ${strings.official.closedTodayNote(closedWhy(reason.closedToday))}` : text;
}

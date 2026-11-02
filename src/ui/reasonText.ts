import type { AccessReason, AccessStatus } from "@/core/access";
import type { OfficialCheck, OfficialClosedVerdict } from "@/core/officialStatus";
import { strings } from "./strings";

type RuleReason = Extract<AccessReason, { kind: "rule" }>;

/** What wasn't checked with the SPW, in words (#211); empty when everything was. */
export function notCheckedText(checks: readonly OfficialCheck[]): string {
  return checks.map((check) => strings.official.notChecked[check]).join(" ");
}

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

/**
 * Why a place has its overall status, in words, for a view that shows one status for
 * several records: only the reasons behind that status, each once. Nothing while
 * checking, where the status says all there is.
 */
export function statusReasonTexts({ state, reasons }: AccessStatus): string[] {
  if (state === "checking") return [];
  const texts = reasons
    .filter((reason) => reason.state === state)
    .map((reason) => (reason.kind === "no-rule" ? strings.accessNoRule : reasonText(reason)));
  return [...new Set(texts)];
}

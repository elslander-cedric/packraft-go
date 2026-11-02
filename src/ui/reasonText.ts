import type { AccessReason } from "@/core/access";
import type { OfficialCheck, OfficialVerdict } from "@/core/officialStatus";
import { strings } from "./strings";

/** What wasn't checked with the SPW, in words (#211); empty when everything was. */
export function notCheckedText(checks: readonly OfficialCheck[]): string {
  return checks.map((check) => strings.official.notChecked[check]).join(" ");
}

function closedText(verdict: Extract<OfficialVerdict, { kind: "closed" }>): string {
  const text = strings.official;
  const { cause, reason } = verdict;
  // Code 0 is "too low, or the reason given": the SPW's own words replace the default.
  if (cause === "too-low-or-stated") return text.closed(reason ?? text.tooLow);
  return text.closed(reason ? `${text.causes[cause]} ${reason}` : text.causes[cause]);
}

/**
 * Why a stretch has its status, in words: the rule text, with what the SPW says
 * today. The SPW's reason only ever comes with a closure (ADR 0035).
 */
export function reasonText(reason: Extract<AccessReason, { kind: "rule" }>): string {
  const { official, ruleText, state, closedBy } = reason;
  switch (official?.kind) {
    case "closed":
      return closedBy === "official" ? closedText(official) : `${ruleText} ${closedText(official)}`;
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

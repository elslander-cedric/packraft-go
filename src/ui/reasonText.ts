import type { AccessReason, AccessStatus } from "@/core/access";
import type { OfficialVerdict } from "@/core/officialStatus";
import { strings } from "./strings";

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

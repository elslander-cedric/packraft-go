import { overlayIds, type OverlayId } from "@/core/settings";
import type { MenuToggle } from "./components/Menu";
import { strings } from "./strings";

/** The overlays as menu switches (ADR 0032), the switched-on ones checked; desktop and phone alike. */
export function overlayToggles(
  on: readonly OverlayId[],
  onChange: (id: OverlayId, on: boolean) => void,
): MenuToggle[] {
  return overlayIds.map((id) => ({
    label: strings.overlays[id],
    checked: on.includes(id),
    onChange: (checked) => onChange(id, checked),
  }));
}

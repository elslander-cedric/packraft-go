import { baseMapIds, isBaseMapId, type BaseMapId } from "@/core/settings";
import type { MenuChoice } from "./components/Menu";
import { strings } from "./strings";

/** The base maps as a menu choice (ADR 0031), the current one marked; desktop and phone alike. */
export function baseMapChoice(value: BaseMapId, onChange: (id: BaseMapId) => void): MenuChoice {
  return {
    label: strings.baseMapButton,
    choices: baseMapIds.map((id) => ({
      value: id,
      label: strings.baseMaps[id],
    })),
    value,
    onChange: (chosen) => {
      if (isBaseMapId(chosen)) onChange(chosen);
    },
  };
}

import type { BaseMapId, OverlayId } from "@/core/settings";
import { baseMapChoice } from "./baseMapChoice";
import { Menu } from "./components/Menu";
import { Icon } from "./icons/Icon";
import { icons } from "./icons/icons";
import { overlayToggles } from "./overlayToggles";
import { strings } from "./strings";
import "./MapMenu.css";

export type MapMenuProps = {
  baseMap: BaseMapId;
  onBaseMapChange: (id: BaseMapId) => void;
  overlays: readonly OverlayId[];
  onOverlayChange: (id: OverlayId, on: boolean) => void;
};

/**
 * The desktop's Map button bottom right (#179, ADR 0032): it opens the base maps, the
 * current one marked, then the overlays' switches. The access layer is switched in the access panel.
 */
export default function MapMenu({ baseMap, onBaseMapChange, overlays, onOverlayChange }: MapMenuProps) {
  return (
    <Menu
      label={strings.mapMenuButton}
      trigger={<Icon icon={icons.mapMenu} />}
      triggerClassName="map-menu-button"
      side="top"
      align="end"
      items={[
        baseMapChoice(baseMap, onBaseMapChange),
        ...overlayToggles(overlays, onOverlayChange).map((toggle, i) => ({ ...toggle, groupStart: i === 0 })),
      ]}
    />
  );
}

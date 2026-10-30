"use client";

import type { BaseMapId, OverlayId } from "@/core/settings";
import { baseMapChoice } from "../baseMapChoice";
import { Menu } from "../components/Menu";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import { overlayToggles } from "../overlayToggles";
import { strings } from "../strings";

export type MapMenuProps = {
  baseMap: BaseMapId;
  onBaseMapChange: (id: BaseMapId) => void;
  accessLayerOn: boolean;
  onAccessLayerChange: (on: boolean) => void;
  overlays: readonly OverlayId[];
  onOverlayChange: (id: OverlayId, on: boolean) => void;
};

/**
 * The layers button (#179, ADR 0031): it opens the Map menu, the base maps
 * (pick one, the current one marked), then the switches of the access layer and the
 * overlays (ADR 0032).
 */
export default function MapMenu({
  baseMap,
  onBaseMapChange,
  accessLayerOn,
  onAccessLayerChange,
  overlays,
  onOverlayChange,
}: MapMenuProps) {
  return (
    <Menu
      label={strings.mapMenuButton}
      trigger={<Icon icon={icons.mapMenu} />}
      triggerClassName="planner-fab"
      align="end"
      items={[
        baseMapChoice(baseMap, onBaseMapChange),
        {
          label: strings.accessLayerToggle,
          checked: accessLayerOn,
          onChange: onAccessLayerChange,
          groupStart: true,
        },
        ...overlayToggles(overlays, onOverlayChange),
      ]}
    />
  );
}

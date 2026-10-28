"use client";

import type { BaseMapId } from "@/core/settings";
import { baseMapChoice } from "../baseMapChoice";
import { Menu } from "../components/Menu";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import { strings } from "../strings";

export type PhoneMapMenuProps = {
  baseMap: BaseMapId;
  onBaseMapChange: (id: BaseMapId) => void;
  accessLayerOn: boolean;
  onAccessLayerChange: (on: boolean) => void;
};

/**
 * The phone's layers button (#179, ADR 0031): it opens the Map menu, the base maps
 * (pick one, the current one marked) and then the access layer's switch.
 */
export default function PhoneMapMenu({
  baseMap,
  onBaseMapChange,
  accessLayerOn,
  onAccessLayerChange,
}: PhoneMapMenuProps) {
  return (
    <Menu
      label={strings.phone.mapMenuButton}
      trigger={<Icon icon={icons.mapMenu} />}
      triggerClassName="phone-fab"
      align="end"
      items={[
        baseMapChoice(baseMap, onBaseMapChange),
        {
          label: strings.accessLayerToggle,
          checked: accessLayerOn,
          onChange: onAccessLayerChange,
          groupStart: true,
        },
      ]}
    />
  );
}

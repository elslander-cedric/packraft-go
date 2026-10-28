import type { BaseMapId } from "@/core/settings";
import { baseMapChoice } from "./baseMapChoice";
import { Menu } from "./components/Menu";
import { Icon } from "./icons/Icon";
import { icons } from "./icons/icons";
import { strings } from "./strings";
import "./BaseMapMenu.css";

/** The desktop's map button bottom right (#179): it opens the base maps, the current one marked. */
export default function BaseMapMenu({ value, onChange }: { value: BaseMapId; onChange: (id: BaseMapId) => void }) {
  return (
    <Menu
      label={strings.baseMapButton}
      trigger={<Icon icon={icons.mapMenu} />}
      triggerClassName="base-map-button"
      side="top"
      align="end"
      items={[baseMapChoice(value, onChange)]}
    />
  );
}

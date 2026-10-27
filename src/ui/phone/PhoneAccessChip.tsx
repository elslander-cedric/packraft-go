import { AccessDateSelector, AccessLegend, type AccessDateProps } from "../AccessPanel";
import { Popover } from "../components/Popover";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import { strings } from "../strings";

/**
 * The chip at the top of the map while the access layer is on (#125): it says which date
 * the colours are for, and opens a popover with the date (today or a trip day, #59), the
 * legend, the note about the regions and the "Indicative only" disclaimer.
 */
export default function PhoneAccessChip({ dateSelector }: { dateSelector: AccessDateProps }) {
  const name = strings.phone.accessChip(dateSelector.isToday ? strings.phone.accessChipToday : dateSelector.date);
  return (
    <Popover
      trigger={
        <>
          {name} <Icon icon={icons.openPopover} />
        </>
      }
      triggerLabel={name}
      triggerClassName="phone-access-chip"
      label={strings.phone.accessPopoverLabel}
    >
      <div className="phone-access-popover">
        <p className="phone-disclaimer">{strings.navigationRulesNotice}</p>
        <AccessDateSelector {...dateSelector} />
        <AccessLegend />
      </div>
    </Popover>
  );
}

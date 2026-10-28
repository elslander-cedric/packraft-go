import { useRef, useState } from "react";
import { AccessDateSelector, AccessLegend, type AccessDateProps } from "../AccessPanel";
import { Button } from "../components/Button";
import { InfoDialog } from "../components/InfoDialog";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import { strings } from "../strings";

/**
 * The chip at the top of the map while the access layer is on (#125): it says which date
 * the colours are for, and opens a dialog with the "Indicative only" disclaimer, the date
 * (today or a trip day, #59), the legend and the note about the regions.
 */
export default function PhoneAccessChip({ dateSelector }: { dateSelector: AccessDateProps }) {
  const [open, setOpen] = useState(false);
  const chip = useRef<HTMLButtonElement>(null);
  const name = strings.phone.accessChip(dateSelector.isToday ? strings.phone.accessChipToday : dateSelector.date);
  return (
    <>
      <Button ref={chip} className="phone-access-chip" aria-label={name} onClick={() => setOpen(true)}>
        {name} <Icon icon={icons.openAccessDialog} />
      </Button>
      <InfoDialog
        open={open}
        title={strings.phone.accessDialogTitle}
        closeLabel={strings.phone.accessDialogClose}
        onClose={() => setOpen(false)}
      >
        <div className="phone-access-dialog">
          <p className="phone-disclaimer">{strings.navigationRulesNotice}</p>
          <AccessDateSelector {...dateSelector} />
          <AccessLegend />
        </div>
      </InfoDialog>
    </>
  );
}

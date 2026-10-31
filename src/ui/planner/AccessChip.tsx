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
export default function AccessChip({ dateSelector }: { dateSelector: AccessDateProps }) {
  const [open, setOpen] = useState(false);
  const chip = useRef<HTMLButtonElement>(null);
  const name = strings.planner.accessChip(dateSelector.isToday ? strings.planner.accessChipToday : dateSelector.date);
  return (
    <>
      <Button ref={chip} className="planner-access-chip" aria-label={name} onClick={() => setOpen(true)}>
        {name} <Icon icon={icons.openAccessDialog} />
      </Button>
      <InfoDialog
        open={open}
        title={strings.planner.accessDialogTitle}
        closeLabel={strings.planner.accessDialogClose}
        onClose={() => setOpen(false)}
      >
        <div className="planner-access-dialog">
          <p className="planner-disclaimer">{strings.navigationRulesNotice}</p>
          <AccessDateSelector {...dateSelector} />
          <AccessLegend />
        </div>
      </InfoDialog>
    </>
  );
}

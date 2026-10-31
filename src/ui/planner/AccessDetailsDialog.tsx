import type { AccessFeature, LockMarker } from "@/core/access";
import { AccessDetail, LockDetail } from "../AccessPanel";
import { InfoDialog } from "../components/InfoDialog";
import { strings } from "../strings";

export type AccessDetailsDialogProps = {
  /** The water whose details are open, if any. */
  water?: AccessFeature;
  /** The lock whose details are open, if any. */
  lock?: LockMarker;
  /** The date the water's status is for. */
  date: string;
  onClose: () => void;
};

/** A water's or a lock's details (#125), in a dialog over the map. */
export default function AccessDetailsDialog({ water, lock, date, onClose }: AccessDetailsDialogProps) {
  return (
    <InfoDialog
      open={water !== undefined || lock !== undefined}
      title={water?.record.name ?? lock?.name ?? ""}
      closeLabel={strings.accessDetailClose}
      onClose={onClose}
    >
      {water ? <AccessDetail feature={water} date={date} /> : lock && <LockDetail lock={lock} />}
    </InfoDialog>
  );
}

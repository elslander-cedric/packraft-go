import type { AccessFeature, LockMarker } from "@/core/access";
import { AccessDetailPanel, LockDetailPanel } from "../AccessPanel";

export type AccessDetailsProps = {
  /** The water whose details are open, if any. */
  water?: AccessFeature;
  /** The lock whose details are open, if any. */
  lock?: LockMarker;
  /** The date the water's status is for. */
  date: string;
  /** Close goes back to the tab under the details. */
  onClose: () => void;
};

/**
 * A water's or a lock's details (#125): shown in the sheet (portrait) or the
 * side panel (sideways), above the open tab, which Close goes back to. Renders nothing
 * while no water or lock is selected.
 */
export default function AccessDetails({ water, lock, date, onClose }: AccessDetailsProps) {
  if (!water && !lock) return null;
  return (
    <div className="planner-access-details">
      {water ? (
        <AccessDetailPanel feature={water} date={date} onClose={onClose} />
      ) : (
        lock && <LockDetailPanel lock={lock} onClose={onClose} />
      )}
    </div>
  );
}

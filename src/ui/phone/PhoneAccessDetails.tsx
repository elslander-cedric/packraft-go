import type { AccessFeature, LockMarker } from "@/core/access";
import { AccessDetailPanel, LockDetailPanel } from "../AccessPanel";

export type PhoneAccessDetailsProps = {
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
 * A water's or a lock's details on the phone (#125): shown in the sheet (portrait) or the
 * side panel (sideways), above the open tab, which Close goes back to. Renders nothing
 * while no water or lock is selected.
 */
export default function PhoneAccessDetails({ water, lock, date, onClose }: PhoneAccessDetailsProps) {
  if (!water && !lock) return null;
  return (
    <div className="phone-access-details">
      {water ? (
        <AccessDetailPanel feature={water} date={date} onClose={onClose} />
      ) : (
        lock && <LockDetailPanel lock={lock} onClose={onClose} />
      )}
    </div>
  );
}

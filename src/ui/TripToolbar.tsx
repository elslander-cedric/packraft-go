import { strings } from "./strings";

type TripToolbarProps = {
  name: string;
  onRename: (name: string) => void;
  onNewTrip: () => void;
};

/** The trip's name and actions on the whole trip. */
export default function TripToolbar({ name, onRename, onNewTrip }: TripToolbarProps) {
  return (
    <div className="trip-toolbar" role="toolbar" aria-label={strings.tripToolbarLabel}>
      <label className="trip-name">
        <span>{strings.tripNameLabel}</span>
        <input
          type="text"
          value={name}
          placeholder={strings.tripNamePlaceholder}
          onChange={(event) => onRename(event.target.value)}
        />
      </label>
      <button type="button" onClick={onNewTrip} title={strings.newTripHint}>
        {strings.newTripButton}
      </button>
    </div>
  );
}

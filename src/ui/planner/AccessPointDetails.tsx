import { accessPointKinds, accessPointUses, type AccessPoint, type AccessPointChanges } from "@/core/accessPoints";
import { Button } from "../components/Button";
import { ToggleGroup } from "../components/ToggleGroup";
import { formatDayDate } from "../format";
import { strings } from "../strings";
import "./AccessPointDetails.css";

const text = strings.accessPoints;

const useOptions = accessPointUses.map((use) => ({ value: use, label: text.uses[use] }));
const kindOptions = accessPointKinds.map((kind) => ({ value: kind, label: text.kinds[kind] }));

/** Today's date in the browser's time zone, as "YYYY-MM-DD". */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

type AccessPointDetailsProps = {
  point: AccessPoint;
  /** A field changed: the dialog keeps it in a draft until Save. */
  onChange: (changes: AccessPointChanges) => void;
};

/** An access point's details, editable: the fields of its dialog (#63). */
export function AccessPointDetails({ point, onChange: update }: AccessPointDetailsProps) {
  const headingId = `access-point-${point.id}`;
  return (
    <section className="access-point-details" aria-labelledby={headingId}>
      <h3 id={headingId}>{text.detailsLabel}</h3>
      <div className="access-point-field">
        <label htmlFor={`${headingId}-name`}>{text.nameLabel}</label>
        <input
          id={`${headingId}-name`}
          type="text"
          // Only a name you typed is in the field; the default name shows greyed, so
          // typing never lands on top of one that arrived meanwhile (ADR 0027).
          value={point.nameSource === "typed" ? point.name : ""}
          placeholder={point.nameSource === "typed" ? "" : point.name || text.namePlaceholder}
          // Typing makes it your name; clearing it brings the default name back.
          onChange={(event) => update({ name: event.target.value })}
        />
      </div>
      <div className="access-point-field">
        <span>{text.useLabel}</span>
        <ToggleGroup label={text.useLabel} value={point.use} options={useOptions} onChange={(use) => update({ use })} />
      </div>
      <div className="access-point-field">
        <span>{text.kindLabel}</span>
        <ToggleGroup
          label={text.kindLabel}
          value={point.kind}
          options={kindOptions}
          onChange={(kind) => update({ kind })}
        />
      </div>
      <label className="access-point-field">
        <span>{text.noteLabel}</span>
        {/* One line. An older note may hold line breaks; the field shows it on one line. */}
        <input
          type="text"
          value={point.note}
          placeholder={text.notePlaceholder}
          onChange={(event) => update({ note: event.target.value })}
        />
      </label>
      <div className="access-point-checked">
        <label className="access-point-field">
          <span>{text.checkedOnSiteLabel}</span>
          <input
            type="date"
            value={point.checkedOnSite ?? ""}
            // An empty value means the field was cleared (or holds no complete date yet).
            onChange={(event) => update({ checkedOnSite: event.target.value || null })}
          />
        </label>
        {point.checkedOnSite === null ? (
          <Button onClick={() => update({ checkedOnSite: today() })}>{text.checkedTodayButton}</Button>
        ) : (
          <Button onClick={() => update({ checkedOnSite: null })}>{text.notCheckedButton}</Button>
        )}
      </div>
      <p className="access-point-dates">
        {`${text.added(formatDayDate(point.createdAt.slice(0, 10)))}, ${text.changed(formatDayDate(point.updatedAt.slice(0, 10)))}`}
      </p>
    </section>
  );
}

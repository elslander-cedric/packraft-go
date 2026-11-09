"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { AccessPoint, AccessPoints as Points } from "@/core/accessPoints";
import type { OfficialAire } from "@/core/officialAire";
import {
  accessPointsByRoute,
  mergeInRouteOrder,
  officialAiresOnRoute,
  type OnRoute,
  type OnRouteAire,
} from "@/core/onRoute";
import type { LatLng, Trip } from "@/core/trip";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import { accessPointText } from "../accessPointText";
import { formatDistance } from "../format";
import { strings } from "../strings";
import type { AccessPointStorage } from "../useAccessPointStorage";

const text = strings.planner;
const pointText = strings.accessPoints;

type Props = {
  /** Your access points. */
  points: Points;
  /** The selected access point's id, or null. */
  selectedId: string | null;
  /** Whether they are being stored, and where a damaged save was backed up. */
  storage: AccessPointStorage;
  /** The trip, whose route splits the list (#156). */
  trip: Trip;
  /** The official aires; the ones on the route are listed among your points (#208). */
  officialAires: readonly OfficialAire[];
  /** Your position when shown, to order the points not on the route; null otherwise. */
  position: LatLng | null;
  /** A row was tapped: show that access point on the map. */
  onOpen: (id: string) => void;
  /** An official aire's row was tapped: open its read-only details. */
  onOpenAire: (id: string) => void;
  /** A row's edit button: open that point's details in the edit dialog. */
  onEdit: (id: string) => void;
  /** A row's delete button, once confirmed. */
  onDelete: (id: string) => void;
};

/** How far along the route an on-route row is, and whether the trip's put-in or take-out is there. */
function alongRoute({ alongKm, role }: OnRoute | OnRouteAire): string {
  const along = text.alongRoute(alongKm.toFixed(1));
  if (role === "put-in") return `${along} · ${text.yourPutIn}`;
  if (role === "take-out") return `${along} · ${text.yourTakeOut}`;
  return along;
}

/**
 * The planner's Access points tab (#119, ADR 0026): your list, each row
 * with edit and delete buttons. While the trip has a route, the points on it
 * come first in route order, then the rest nearest to you (#156). Official
 * aires on the route sit among them, read-only (#208). Marking is the floating
 * button on the map; the details are a dialog. Every change is saved on the
 * device at once by `useAccessPointStorage`, with or without signal.
 */
export default function AccessPoints({
  points,
  selectedId,
  storage,
  trip,
  officialAires,
  position,
  onOpen,
  onOpenAire,
  onEdit,
  onDelete,
}: Props) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const lists = useRef<HTMLDivElement>(null);
  const onRouteId = useId();
  const notOnRouteId = useId();
  const split = useMemo(() => accessPointsByRoute(trip, points, position), [trip, points, position]);
  const onRoute = useMemo(
    () => mergeInRouteOrder(split.onRoute, officialAiresOnRoute(trip, officialAires)),
    [split, trip, officialAires],
  );

  // Bring the selected row into view, e.g. after a marker tap.
  useEffect(() => {
    if (selectedId) lists.current?.querySelector("[aria-current]")?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId]);

  const savingPausedAlert = storage.savingPaused !== null && (
    <p role="alert" className="planner-position-alert">
      {storage.savingPaused === "unknown-version" ? pointText.autosaveUnknownVersion : pointText.damagedNotBackedUp}
    </p>
  );
  // A damaged save was backed up on load, before it was replaced (round 2 of #55).
  const backedUpNote = storage.backupKey !== null && (
    <p role="status" className="planner-position-alert">
      {pointText.damagedBackedUp(storage.backupKey)}
    </p>
  );

  const row = (point: AccessPoint, figure: string | null): ReactNode => {
    const { heading, note, detail } = accessPointText(point);
    return (
      <li key={point.id} className="planner-access-point-item">
        <Button
          className="planner-row planner-access-point-row"
          aria-current={point.id === selectedId || undefined}
          onClick={() => onOpen(point.id)}
        >
          <span className="planner-row-heading">{heading}</span>
          {figure && <span className="planner-access-point-figure">{figure}</span>}
          {note && <span className="planner-access-point-note">{note}</span>}
          {detail && <span className="planner-access-point-detail">{detail}</span>}
        </Button>
        <Button
          className="planner-access-point-action"
          aria-label={text.editAccessPoint(heading)}
          onClick={() => onEdit(point.id)}
        >
          <Icon icon={icons.editAccessPoint} />
        </Button>
        <Button
          className="planner-access-point-action"
          aria-label={text.deleteAccessPoint(heading)}
          onClick={() => setPendingDelete(point.id)}
        >
          <Icon icon={icons.deleteAccessPoint} />
        </Button>
      </li>
    );
  };
  // Read-only: the row only opens the details, with no edit or delete.
  const aireRow = (entry: OnRouteAire): ReactNode => (
    <li key={entry.aire.id} className="planner-access-point-item">
      <Button className="planner-row planner-access-point-row" onClick={() => onOpenAire(entry.aire.id)}>
        <span className="planner-row-heading">{entry.aire.name}</span>
        <span className="planner-access-point-figure">{alongRoute(entry)}</span>
        <span className="planner-access-point-detail">{strings.officialAires.legend[entry.aire.use]}</span>
      </Button>
    </li>
  );
  const notOnRouteRows = split.notOnRoute.map(({ point, fromYouKm }) =>
    row(point, fromYouKm === null ? null : text.fromYou(formatDistance(fromYouKm))),
  );

  return (
    <section className="planner-access-points" aria-label={text.accessPointsLabel}>
      {savingPausedAlert}
      {backedUpNote}
      {points.length === 0 && onRoute.length === 0 ? (
        <p className="planner-empty">{text.noAccessPoints}</p>
      ) : (
        <div ref={lists} className="planner-access-point-lists">
          {!split.hasRoute ? (
            <ul className="planner-access-point-list" aria-label={text.accessPointsLabel}>
              {notOnRouteRows}
            </ul>
          ) : (
            <>
              <h3 id={onRouteId} className="planner-access-point-heading">
                {text.onRouteHeading}
              </h3>
              {onRoute.length === 0 ? (
                <p className="planner-empty planner-access-point-none">{text.noneOnRoute}</p>
              ) : (
                <ul className="planner-access-point-list" aria-labelledby={onRouteId}>
                  {onRoute.map((entry) => ("aire" in entry ? aireRow(entry) : row(entry.point, alongRoute(entry))))}
                </ul>
              )}
              {notOnRouteRows.length > 0 && (
                <>
                  <h3 id={notOnRouteId} className="planner-access-point-heading">
                    {text.notOnRouteHeading}
                  </h3>
                  <ul className="planner-access-point-list" aria-labelledby={notOnRouteId}>
                    {notOnRouteRows}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={pointText.deleteConfirm.title}
        message={pointText.deleteConfirm.message}
        confirmLabel={pointText.deleteConfirm.confirm}
        cancelLabel={strings.confirmCancel}
        onConfirm={() => {
          if (pendingDelete !== null) onDelete(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}

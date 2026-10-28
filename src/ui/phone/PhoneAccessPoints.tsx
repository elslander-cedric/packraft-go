"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { AccessPoint } from "@/core/accessPoints";
import { accessPointsByRoute, type OnRoute } from "@/core/onRoute";
import type { LatLng, Trip } from "@/core/trip";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import { accessPointText } from "../accessPointText";
import { formatDistance } from "../format";
import { strings } from "../strings";
import type { AccessPointsState } from "../useAccessPoints";

const text = strings.phone;
const pointText = strings.accessPoints;

type Props = {
  access: AccessPointsState;
  /** The trip, whose route splits the list (#156). */
  trip: Trip;
  /** Your position when shown, to order the points not on the route; null otherwise. */
  position: LatLng | null;
  /** A row was tapped: show that access point on the map. */
  onOpen: (id: string) => void;
  /** A row's edit button: open that point's details in the edit dialog. */
  onEdit: (id: string) => void;
};

/** How far along the route an on-route row is, and whether the trip's put-in or take-out is there. */
function alongRoute({ alongKm, role }: OnRoute): string {
  const along = text.alongRoute(alongKm.toFixed(1));
  if (role === "put-in") return `${along} · ${text.yourPutIn}`;
  if (role === "take-out") return `${along} · ${text.yourTakeOut}`;
  return along;
}

/**
 * The phone planner's Access points tab (#119, ADR 0026): your list, each row
 * with edit and delete buttons. While the trip has a route, the points on it
 * come first in route order, then the rest nearest to you (#156). Marking is
 * the floating button on the map; the details are a dialog. Every change is
 * saved on the device at once by `useAccessPoints`, with or without signal.
 */
export default function PhoneAccessPoints({ access, trip, position, onOpen, onEdit }: Props) {
  const { points, selected } = access;
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const lists = useRef<HTMLDivElement>(null);
  const onRouteId = useId();
  const notOnRouteId = useId();
  const split = useMemo(() => accessPointsByRoute(trip, points, position), [trip, points, position]);

  // Bring the selected row into view, e.g. after a marker tap.
  useEffect(() => {
    if (selected) lists.current?.querySelector("[aria-current]")?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  const savingPausedAlert = access.savingPaused !== null && (
    <p role="alert" className="phone-position-alert">
      {access.savingPaused === "unknown-version" ? pointText.autosaveUnknownVersion : pointText.damagedNotBackedUp}
    </p>
  );

  const row = (point: AccessPoint, figure: string | null): ReactNode => {
    const { heading, note, detail } = accessPointText(point);
    return (
      <li key={point.id} className="phone-access-point-item">
        <Button
          className="phone-row phone-access-point-row"
          aria-current={point.id === selected?.id || undefined}
          onClick={() => onOpen(point.id)}
        >
          <span className="phone-row-heading">{heading}</span>
          {figure && <span className="phone-access-point-figure">{figure}</span>}
          {note && <span className="phone-access-point-note">{note}</span>}
          {detail && <span className="phone-access-point-detail">{detail}</span>}
        </Button>
        <Button
          className="phone-access-point-action"
          aria-label={text.editAccessPoint(heading)}
          onClick={() => onEdit(point.id)}
        >
          <Icon icon={icons.editAccessPoint} />
        </Button>
        <Button
          className="phone-access-point-action"
          aria-label={text.deleteAccessPoint(heading)}
          onClick={() => setPendingDelete(point.id)}
        >
          <Icon icon={icons.deleteAccessPoint} />
        </Button>
      </li>
    );
  };
  const notOnRouteRows = split.notOnRoute.map(({ point, fromYouKm }) =>
    row(point, fromYouKm === null ? null : text.fromYou(formatDistance(fromYouKm))),
  );

  return (
    <section className="phone-access-points" aria-label={text.accessPointsLabel}>
      {savingPausedAlert}
      {points.length === 0 ? (
        <p className="phone-empty">{text.noAccessPoints}</p>
      ) : (
        <div ref={lists} className="phone-access-point-lists">
          {!split.hasRoute ? (
            <ul className="phone-access-point-list" aria-label={text.accessPointsLabel}>
              {notOnRouteRows}
            </ul>
          ) : (
            <>
              <h3 id={onRouteId} className="phone-access-point-heading">
                {text.onRouteHeading}
              </h3>
              {split.onRoute.length === 0 ? (
                <p className="phone-empty phone-access-point-none">{text.noneOnRoute}</p>
              ) : (
                <ul className="phone-access-point-list" aria-labelledby={onRouteId}>
                  {split.onRoute.map((entry) => row(entry.point, alongRoute(entry)))}
                </ul>
              )}
              {notOnRouteRows.length > 0 && (
                <>
                  <h3 id={notOnRouteId} className="phone-access-point-heading">
                    {text.notOnRouteHeading}
                  </h3>
                  <ul className="phone-access-point-list" aria-labelledby={notOnRouteId}>
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
          if (pendingDelete !== null) access.remove(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}

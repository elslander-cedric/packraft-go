"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import { accessPointText } from "../accessPointText";
import { strings } from "../strings";
import type { AccessPointsState } from "../useAccessPoints";

const text = strings.phone;
const pointText = strings.accessPoints;

type Props = {
  access: AccessPointsState;
  /** Your access points changed since the planner opened (each Save is stored at once). */
  changed: boolean;
  /** A row was tapped: show that access point on the map. */
  onOpen: (id: string) => void;
  /** A row's edit button: open that point's details in the edit dialog. */
  onEdit: (id: string) => void;
};

/**
 * The phone planner's Access points tab (#119, ADR 0026): your list, each row
 * with edit and delete buttons. Marking is the floating button on the map; the
 * details are a dialog. Every change is saved on the device at once by
 * `useAccessPoints`, with or without signal.
 */
export default function PhoneAccessPoints({ access, changed, onOpen, onEdit }: Props) {
  const { points, selected } = access;
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);

  // Bring the selected row into view, e.g. after a marker tap.
  useEffect(() => {
    if (selected) list.current?.querySelector("[aria-current]")?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  const savedNote =
    access.savingPaused === null ? (
      changed && (
        <p role="status" className="phone-saved">
          {text.savedOnDevice}
        </p>
      )
    ) : (
      <p role="alert" className="phone-position-alert">
        {access.savingPaused === "unknown-version" ? pointText.autosaveUnknownVersion : pointText.damagedNotBackedUp}
      </p>
    );

  return (
    <section className="phone-access-points" aria-label={text.accessPointsLabel}>
      {savedNote}
      {points.length === 0 ? (
        <p className="phone-empty">{text.noAccessPoints}</p>
      ) : (
        <ul ref={list} className="phone-access-point-list" aria-label={text.accessPointsLabel}>
          {points.map((point) => {
            const { heading, note, detail } = accessPointText(point);
            return (
              <li key={point.id} className="phone-access-point-item">
                <Button
                  className="phone-row phone-access-point-row"
                  aria-current={point.id === selected?.id || undefined}
                  onClick={() => onOpen(point.id)}
                >
                  <span className="phone-row-heading">{heading}</span>
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
          })}
        </ul>
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

"use client";

import { useId, useRef, useState } from "react";
import { newTripNeedsConfirmation, type Trip } from "@/core/trip";
import { readTripFile } from "@/persistence/tripFile";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { defaultSettings } from "@/core/settings";
import { summarise } from "@/core/summarise";
import ClientPhoneMap from "@/map/ClientPhoneMap";
import { loadStoredTrip, storeTrip } from "@/persistence/tripStorage";
import { Button } from "../components/Button";
import { strings } from "../strings";
import { useSettings } from "../useSettings";
import { positionMessage } from "./position";
import PhoneTripView from "./PhoneTripView";
import { usePosition } from "./usePosition";
import "./phone.css";

/**
 * The phone layout (#56, ADR 0023): the map with your position on request,
 * and the stored trip, read-only. Planning controls aren't here; planning
 * stays on a computer. The trip is read from browser storage and never
 * written back.
 */
export default function PhoneApp() {
  // Rendered in the browser only (see ClientTripPlanner), where storage exists.
  const [{ trip: stored }] = useState(loadStoredTrip);
  const [trip, setTrip] = useState<Trip>(stored);
  const [settings] = useSettings();
  const [position, showPosition] = usePosition();
  const message = positionMessage(position);
  const explanation = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const openFileButton = useRef<HTMLButtonElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // An opened trip waiting for the answer to "replace the current trip?".
  const [pendingTrip, setPendingTrip] = useState<Trip | null>(null);

  // The only way the phone's trip changes: a trip file replaces it, and is stored (still there offline and after a reload).
  const replaceTrip = (next: Trip) => {
    storeTrip(next);
    setTrip(next);
    setFileError(null);
  };
  const openFile = async (file: File) => {
    const opened = await readTripFile(file);
    if (!opened.ok) {
      setFileError(opened.reason === "unknown-version" ? strings.openFileUnknownVersion : strings.openFileInvalid);
    } else if (newTripNeedsConfirmation(trip)) {
      setPendingTrip(opened.trip);
    } else {
      replaceTrip(opened.trip);
    }
  };

  return (
    <div className="phone">
      <ClientPhoneMap
        trip={trip}
        position={position.state === "shown" ? { at: position.at, accuracyM: position.accuracyM } : null}
      />
      <div className="phone-panel">
        <div className="phone-position">
          <Button
            className="phone-button"
            onClick={showPosition}
            aria-describedby={explanation}
            disabled={position.state === "locating"}
          >
            {strings.phone.showPositionButton}
          </Button>
          <p id={explanation} className="phone-position-explanation">
            {strings.phone.positionExplanation}
          </p>
          {message && (
            <p role={message.kind} className={`phone-position-${message.kind}`}>
              {message.text}
            </p>
          )}
        </div>
        <div className="phone-position">
          <Button ref={openFileButton} className="phone-button" onClick={() => fileInput.current?.click()}>
            {strings.phone.openFileButton}
          </Button>
          <p className="phone-position-explanation">{strings.phone.openFileExplanation}</p>
          {fileError && (
            <p role="alert" className="phone-position-alert">
              {fileError}
            </p>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Clear the choice, so choosing the same file again still opens it.
              event.target.value = "";
              if (file) void openFile(file);
            }}
          />
        </div>
        <PhoneTripView trip={trip} summary={summarise(trip, settings ?? defaultSettings)} />
      </div>
      <ConfirmDialog
        open={pendingTrip !== null}
        title={strings.openFileConfirm.title}
        message={strings.openFileConfirm.message}
        confirmLabel={strings.openFileConfirm.confirm}
        cancelLabel={strings.confirmCancel}
        onConfirm={() => {
          if (pendingTrip) replaceTrip(pendingTrip);
          setPendingTrip(null);
        }}
        onCancel={() => setPendingTrip(null)}
        returnFocusTo={openFileButton}
      />
    </div>
  );
}

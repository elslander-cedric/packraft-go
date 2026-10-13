"use client";

import { useId, useState } from "react";
import { defaultSettings } from "@/core/settings";
import { summarise } from "@/core/summarise";
import ClientPhoneMap from "@/map/ClientPhoneMap";
import { loadStoredTrip } from "@/persistence/tripStorage";
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
  const [{ trip }] = useState(loadStoredTrip);
  const [settings] = useSettings();
  const [position, showPosition] = usePosition();
  const message = positionMessage(position);
  const explanation = useId();

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
        <PhoneTripView trip={trip} summary={summarise(trip, settings ?? defaultSettings)} />
      </div>
    </div>
  );
}

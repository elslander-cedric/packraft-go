"use client";

import dynamic from "next/dynamic";
import { strings } from "./strings";

const loading = () => <div className="planner-loading">{strings.plannerLoading}</div>;

// The planner starts from the trip in browser storage, which only exists in
// the browser, so it is never rendered on the server. Every screen gets the
// one planner, with a bottom sheet or a side panel (ADR 0034).
const PhonePlanner = dynamic(() => import("./phone/PhonePlanner"), { ssr: false, loading });

export default function ClientTripPlanner() {
  return <PhonePlanner />;
}

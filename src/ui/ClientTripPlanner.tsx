"use client";

import dynamic from "next/dynamic";
import { strings } from "./strings";

// The planner starts from the trip in browser storage, which only exists in
// the browser, so it is never rendered on the server.
const TripPlanner = dynamic(() => import("./TripPlanner"), {
  ssr: false,
  loading: () => <div className="planner-loading">{strings.plannerLoading}</div>,
});

export default function ClientTripPlanner() {
  return <TripPlanner />;
}

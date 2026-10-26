"use client";

import dynamic from "next/dynamic";
import { usePhoneLayout } from "./phone/usePhoneLayout";
import { strings } from "./strings";

const loading = () => <div className="planner-loading">{strings.plannerLoading}</div>;

// The planner starts from the trip in browser storage, which only exists in
// the browser, so it is never rendered on the server.
const TripPlanner = dynamic(() => import("./TripPlanner"), { ssr: false, loading });
// Phones get the same planner with a phone layout (ADR 0026).
const PhonePlanner = dynamic(() => import("./phone/PhonePlanner"), { ssr: false, loading });

export default function ClientTripPlanner() {
  const phone = usePhoneLayout();
  if (phone === null) return loading();
  return phone ? <PhonePlanner /> : <TripPlanner />;
}

"use client";

import dynamic from "next/dynamic";
import { usePhoneLayout } from "./phone/usePhoneLayout";
import { strings } from "./strings";

const loading = () => <div className="planner-loading">{strings.plannerLoading}</div>;

// The planner starts from the trip in browser storage, which only exists in
// the browser, so it is never rendered on the server.
const TripPlanner = dynamic(() => import("./TripPlanner"), { ssr: false, loading });
// Phones get their own layout (#56, ADR 0023): planning stays on a computer.
const PhoneApp = dynamic(() => import("./phone/PhoneApp"), { ssr: false, loading });

export default function ClientTripPlanner() {
  const phone = usePhoneLayout();
  if (phone === null) return loading();
  return phone ? <PhoneApp /> : <TripPlanner />;
}

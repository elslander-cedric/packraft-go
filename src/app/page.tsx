import ClientTripMap from "@/map/ClientTripMap";
import { strings } from "@/ui/strings";

export default function Home() {
  return (
    <main className="app">
      <p className="navigation-notice" role="note">
        {strings.navigationRulesNotice}
      </p>
      <ClientTripMap />
    </main>
  );
}

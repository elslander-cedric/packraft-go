import TripPlanner from "@/ui/TripPlanner";
import { strings } from "@/ui/strings";

export default function Home() {
  return (
    <main className="app">
      <p className="navigation-notice" role="note">
        {strings.navigationRulesNotice}
      </p>
      <TripPlanner />
    </main>
  );
}

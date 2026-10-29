import ClientTripPlanner from "@/ui/ClientTripPlanner";
import { strings } from "@/ui/strings";
import { ToggleVariantSwitcher } from "@/ui/components/toggleVariants.prototype";

export default function Home() {
  return (
    <main className="app">
      <p className="navigation-notice" role="note">
        {strings.navigationRulesNotice}
      </p>
      <ClientTripPlanner />
      <ToggleVariantSwitcher />
    </main>
  );
}

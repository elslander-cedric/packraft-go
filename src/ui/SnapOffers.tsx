import type { SnapOffer } from "@/core/snap";
import { Button } from "./components/Button";
import { strings } from "./strings";
import "./SnapOffers.css";

const text = strings.snap;
const accessText = strings.accessPoints;

type SnapOffersProps = {
  offers: readonly SnapOffer[];
  onAccept: (offer: SnapOffer) => void;
  onDecline: (offer: SnapOffer) => void;
};

/**
 * Offers to snap a new put-in or take-out to a nearby access point of yours
 * (#62). Declining changes nothing; accepting is an undoable move. Renders the
 * core's offers; no domain logic.
 */
export default function SnapOffers({ offers, onAccept, onDecline }: SnapOffersProps) {
  if (offers.length === 0) return null;
  return (
    <section className="snap-offers" role="region" aria-label={text.label}>
      {offers.map((offer) => {
        const name = offer.accessPoint.name.trim();
        return (
          <div key={`${offer.change.kind}-${offer.change.point}`} className="snap-offer">
            <p>
              {text.offer(
                text.kinds[offer.change.kind],
                Math.round(offer.distanceM),
                name || null,
                accessText.uses[offer.accessPoint.use].toLowerCase(),
                accessText.kinds[offer.accessPoint.kind].toLowerCase(),
              )}
            </p>
            <Button onClick={() => onAccept(offer)}>{text.accept}</Button>
            <Button onClick={() => onDecline(offer)}>{text.decline}</Button>
          </div>
        );
      })}
    </section>
  );
}

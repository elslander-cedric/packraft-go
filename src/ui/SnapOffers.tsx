import type { SnapOffer } from "@/core/snap";
import { Button } from "./components/Button";
import { strings } from "./strings";
import "./components/Dialog.css";
import "./SnapOffers.css";

const text = strings.snap;
const accessText = strings.accessPoints;

/** The offer's question, naming its target. */
function offerText({ change, target, distanceM }: SnapOffer) {
  const kind = text.kinds[change.kind];
  const metres = Math.round(distanceM);
  if (target.kind === "official-aire") {
    return text.offerAire(kind, metres, target.aire.name, accessText.uses[target.aire.use].toLowerCase());
  }
  const { name, use, kind: accessKind } = target.accessPoint;
  return text.offer(
    kind,
    metres,
    name.trim() || null,
    accessText.uses[use].toLowerCase(),
    accessText.kinds[accessKind].toLowerCase(),
  );
}

type SnapOffersProps = {
  offers: readonly SnapOffer[];
  onAccept: (offer: SnapOffer) => void;
  onDecline: (offer: SnapOffer) => void;
};

/**
 * Offers to snap a new put-in or take-out to a nearby access point of yours or
 * official aire (ADR 0035). Declining changes nothing; accepting is an undoable move. Renders the
 * core's offers; no domain logic.
 */
export default function SnapOffers({ offers, onAccept, onDecline }: SnapOffersProps) {
  if (offers.length === 0) return null;
  return (
    <section className="snap-offers" role="region" aria-label={text.label}>
      {offers.map((offer) => (
        <div key={`${offer.change.kind}-${offer.change.point}`} className="snap-offer">
          <p>{offerText(offer)}</p>
          {/* The dialogs' buttons, in their order: the main action filled, on the right. */}
          <div className="dialog-actions dialog-buttons">
            <Button onClick={() => onDecline(offer)}>{text.decline}</Button>
            <Button className="button-primary" onClick={() => onAccept(offer)}>
              {text.accept}
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}

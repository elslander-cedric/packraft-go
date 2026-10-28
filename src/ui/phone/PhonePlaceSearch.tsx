import { useRef, useState } from "react";
import { Button } from "../components/Button";
import { useVisibleArea } from "../components/visibleArea";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import PlaceSearchBar from "../PlaceSearchBar";
import { strings } from "../strings";
import type { PlaceSearch } from "../usePlaceSearch";

const text = strings.placeSearch;

/**
 * Place search on the phone (#174, ADR 0030): a pill on the top row, between the menu and the
 * right-hand buttons. Tapping it widens it over them into a field with Back, its results and
 * messages under it, kept above the on-screen keyboard (#163). A newly shown result (picked, or
 * coordinates) narrows it back, and its name stays in the pill; × clears it. Back closes the
 * field and leaves a shown result on the map.
 */
export default function PhonePlaceSearch({ search }: { search: PlaceSearch }) {
  const { shown } = search.state;
  const [open, setOpen] = useState(false);
  const [lastShown, setLastShown] = useState(shown);
  if (shown !== lastShown) {
    setLastShown(shown);
    if (shown) setOpen(false);
  }
  const box = useRef<HTMLDivElement>(null);
  const visibleArea = useVisibleArea(open, box);

  if (!open) {
    return (
      <div className="phone-place-search">
        <Button className="phone-search-pill" aria-label={text.pill(shown?.label)} onClick={() => setOpen(true)}>
          <Icon icon={icons.search} />
          <span className={shown ? "phone-search-pill-text" : "phone-search-pill-text phone-search-pill-placeholder"}>
            {shown?.label ?? text.placeholder}
          </span>
        </Button>
        {shown && (
          <Button className="phone-search-pill-clear" aria-label={text.clear} onClick={search.clear}>
            <Icon icon={icons.clearSearch} />
          </Button>
        )}
      </div>
    );
  }

  const close = () => {
    search.dismiss();
    setOpen(false);
  };
  return (
    <div ref={box} className="phone-place-search phone-place-search-open" style={visibleArea}>
      <PlaceSearchBar
        search={search}
        inline
        autoFocus
        className="phone-place-search-box"
        leading={
          <button type="button" className="search-box-icon-button" aria-label={text.back} onClick={close}>
            <Icon icon={icons.closeSearch} />
          </button>
        }
      />
    </div>
  );
}

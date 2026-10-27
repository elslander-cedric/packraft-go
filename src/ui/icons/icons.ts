// The app's UI icons (#143, ADR 0028): Font Awesome Free Solid, imported only here,
// so switching to another set only touches src/ui/icons/. Their names stay in strings.ts.
import {
  faArrowTrendDown,
  faArrowTrendUp,
  faBars,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faClock,
  faFlag,
  faLayerGroup,
  faLocationCrosshairs,
  faRotateLeft,
  faShoePrints,
  faTent,
  faWater,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

export type { IconDefinition } from "@fortawesome/free-solid-svg-icons";

export const icons = {
  // No kayak in Font Awesome Free: hike is footprints, paddle is water.
  hike: faShoePrints,
  paddle: faWater,
  climb: faArrowTrendUp,
  descent: faArrowTrendDown,
  time: faClock,
  showPosition: faLocationCrosshairs,
  undo: faRotateLeft,
  accessPoint: faFlag,
  deletePoint: faXmark,
  camp: faTent,
  accessLayer: faLayerGroup,
  menu: faBars,
  openPopover: faChevronDown,
  // The side panel is on the right: it opens leftwards and collapses rightwards.
  expandPanel: faChevronLeft,
  collapsePanel: faChevronRight,
};

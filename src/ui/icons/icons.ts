// The app's UI icons (#143, ADR 0028): Font Awesome Free Solid, imported only here,
// so switching to another set only touches src/ui/icons/. Their names stay in strings.ts.
import {
  faArrowTrendDown,
  faArrowTrendUp,
  faBan,
  faBars,
  faCalendarXmark,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faCircleInfo,
  faClock,
  faFileCirclePlus,
  faFileExport,
  faFlag,
  faFloppyDisk,
  faFolderOpen,
  faGear,
  faGaugeHigh,
  faLayerGroup,
  faLocationCrosshairs,
  faPen,
  faRotateLeft,
  faShoePrints,
  faStairs,
  faTent,
  faTrashCan,
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
  // An access point row's edit and delete buttons (phone).
  editAccessPoint: faPen,
  deleteAccessPoint: faTrashCan,
  camp: faTent,
  accessLayer: faLayerGroup,
  menu: faBars,
  openPopover: faChevronDown,
  // The side panel is on the right: it opens leftwards and collapses rightwards.
  expandPanel: faChevronLeft,
  collapsePanel: faChevronRight,
  // A leg row's button that opens its access details (phone, #158).
  legDetails: faCircleInfo,
  // A day card's warning chips, by the leg's most serious kind.
  warningForbidden: faBan,
  warningClosed: faCalendarXmark,
  warningCheckFlow: faGaugeHigh,
  warningLock: faStairs,
  warningAire: faFlag,
  // The phone menu's items.
  newTrip: faFileCirclePlus,
  editTrip: faPen,
  saveTrip: faFloppyDisk,
  openTrip: faFolderOpen,
  exportGpx: faFileExport,
  settings: faGear,
};

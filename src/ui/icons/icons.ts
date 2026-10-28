// The app's UI icons (#143, ADR 0028): Font Awesome Free Solid, imported only here,
// so switching to another set only touches src/ui/icons/. Their names stay in strings.ts.
import {
  faArrowLeft,
  faArrowsSpin,
  faArrowTrendDown,
  faArrowTrendUp,
  faBan,
  faBars,
  faCalendarXmark,
  faCircleCheck,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faCircleInfo,
  faCircleQuestion,
  faClock,
  faFileCirclePlus,
  faFileExport,
  faFlag,
  faFloppyDisk,
  faFolderOpen,
  faGear,
  faGaugeHigh,
  faHourglassHalf,
  faLayerGroup,
  faLocationCrosshairs,
  faLocationDot,
  faMagnifyingGlass,
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
  // Back to start (GLOSSARY "Loop"), on the phone's map.
  backToStart: faArrowsSpin,
  accessPoint: faFlag,
  deletePoint: faXmark,
  // An access point row's edit and delete buttons (phone).
  editAccessPoint: faPen,
  deleteAccessPoint: faTrashCan,
  camp: faTent,
  accessLayer: faLayerGroup,
  menu: faBars,
  openAccessDialog: faChevronDown,
  // The side panel is on the right: it opens leftwards and collapses rightwards.
  expandPanel: faChevronLeft,
  collapsePanel: faChevronRight,
  // A leg row's button that opens its access details (phone, #158).
  legDetails: faCircleInfo,
  // A leg's access status (phone rows and details), in the status's colour.
  accessOpen: faCircleCheck,
  accessClosedToday: faCalendarXmark,
  accessForbidden: faBan,
  accessUnknown: faCircleQuestion,
  accessChecking: faHourglassHalf,
  // A day card's warning chips and the warnings themselves, by kind.
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
  // Place search (#173): the bar's magnifier and ×, and the search result's pin on the map.
  search: faMagnifyingGlass,
  clearSearch: faXmark,
  searchResult: faLocationDot,
  // The phone's open search field closes back to its pill (#174).
  closeSearch: faArrowLeft,
};

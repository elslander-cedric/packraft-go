// The app's UI icons (#143, ADR 0028): Font Awesome Free Solid, imported only here,
// so switching to another set only touches src/ui/icons/. Their names stay in strings.ts.
import {
  faArrowDown,
  faArrowLeft,
  faArrowsDownToLine,
  faArrowsSpin,
  faArrowsUpDown,
  faArrowTrendDown,
  faArrowTrendUp,
  faArrowTurnDown,
  faArrowUp,
  faBan,
  faBars,
  faBridgeWater,
  faCalendarXmark,
  faCircleCheck,
  faCircleExclamation,
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
  faHand,
  faHourglassHalf,
  faLayerGroup,
  faLocationCrosshairs,
  faLocationDot,
  faMagnifyingGlass,
  faMapLocationDot,
  faMountain,
  faPen,
  faRightFromBracket,
  faRotateLeft,
  faShoePrints,
  faStairs,
  faTent,
  faTrashCan,
  faTriangleExclamation,
  faWater,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import type { ObstacleKind } from "@/core/obstacle";

export type { IconDefinition } from "@fortawesome/free-solid-svg-icons";

/** An obstacle's marker, legend line and details (ADR 0035), by kind. */
export const obstacleIcons: Readonly<Record<ObstacleKind, typeof faHand>> = {
  dam: faArrowsDownToLine,
  impassable: faHand,
  rocks: faMountain,
  drossage: faArrowTurnDown,
  "low-bridge": faBridgeWater,
};

export const icons = {
  // No kayak in Font Awesome Free: hike is footprints, paddle is water.
  hike: faShoePrints,
  paddle: faWater,
  climb: faArrowTrendUp,
  descent: faArrowTrendDown,
  time: faClock,
  showPosition: faLocationCrosshairs,
  undo: faRotateLeft,
  // Back to start (GLOSSARY "Loop"), on the map.
  backToStart: faArrowsSpin,
  // Your access point: its marker on the map, and the button that marks one (access point editing).
  accessPoint: faFlag,
  // Enters access point editing (ADR 0036), and the same button while in it, which leaves it.
  editAccessPoints: faMapLocationDot,
  leaveAccessPointEditing: faRightFromBracket,
  // The selected point's delete button, in its card; the trash can of an access point row.
  deletePoint: faTrashCan,
  // Unselects the selected leg or point, in its card.
  unselect: faXmark,
  // An official aire's marker and legend (ADR 0035): down onto the water, up off it.
  airePutIn: faArrowDown,
  aireTakeOut: faArrowUp,
  aireBoth: faArrowsUpDown,
  // An access point row's edit and delete buttons.
  editAccessPoint: faPen,
  deleteAccessPoint: faTrashCan,
  camp: faTent,
  // The layers button that opens the Map menu.
  mapMenu: faLayerGroup,
  menu: faBars,
  openAccessDialog: faChevronDown,
  // The side panel is on the right: it opens leftwards and collapses rightwards.
  expandPanel: faChevronLeft,
  collapsePanel: faChevronRight,
  // A leg row's button that opens its access details (#158).
  legDetails: faCircleInfo,
  // A leg's access status (rows and details), in the status's colour.
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
  warningObstacle: faTriangleExclamation,
  warningIncident: faCircleExclamation,
  // An incident's marker and legend (ADR 0035).
  incident: faTriangleExclamation,
  warningAire: faFlag,
  // The planner menu's items.
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
  // The open search field closes back to its pill (#174).
  closeSearch: faArrowLeft,
};

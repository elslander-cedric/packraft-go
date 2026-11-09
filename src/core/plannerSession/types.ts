// The planner session's state and actions (ADR 0025). The rules are in `index.ts`.
import type { AccessPoint, AccessPointChanges, AccessPoints, Timestamp } from "../accessPoints";
import type { CalendarDate } from "../calendarDate";
import type { OfficialAire } from "../officialAire";
import type { RoutingAction } from "../routing";
import type { SnapOffer } from "../snap";
import type { LatLng, LegMode, Trip } from "../trip";

/** The questions asked before a trip with points is replaced. */
export type ReplaceQuestion = "newTrip" | "openFile";

/** Why a file could not be opened. */
export type FileError = "unknown-version" | "invalid";

/** Where the bottom sheet rests: just the header, half the screen, or nearly all of it. */
export const sheetStops = ["peek", "half", "full"] as const;
export type SheetStop = (typeof sheetStops)[number];

/** The panel's tabs in normal mode; access point editing shows only the Access points tab (ADR 0036). */
export const normalTabs = ["sections", "days"] as const;
export type NormalTab = (typeof normalTabs)[number];

/**
 * The panel or sheet as it was before access point editing: Done restores it (ADR 0036). The side
 * panel's open state isn't here: it is a stored setting, left alone while editing.
 */
export type PanelView = {
  readonly tab: NormalTab;
  /** The bottom sheet's stop. */
  readonly sheet: SheetStop;
};

/** The planner's mode (GLOSSARY "Access point editing", ADR 0036): always normal on load. */
export type PlannerMode =
  | { readonly kind: "normal" }
  | { readonly kind: "accessPointEditing"; readonly returnTo: PanelView };

export type PlannerSession = {
  readonly mode: PlannerMode;
  readonly trip: Trip;
  /** Index of the selected point, or null. */
  readonly selectedPoint: number | null;
  /** Index of the selected leg (#230), or null; never set together with a selected point. */
  readonly selectedLeg: number | null;
  readonly offers: readonly SnapOffer[];
  readonly fileError: FileError | null;
  /** A stored save of an unknown version is kept, not overwritten, until the trip is replaced (#28). */
  readonly keepStoredSave: boolean;
  /** The last question asked; kept after it is answered. */
  readonly question: ReplaceQuestion;
  /** The trip waiting to replace the current one until the question is answered. */
  readonly pendingTrip: Trip | null;
  /** The next leg's mode the planner picked (#121), or null: then it is the last leg's (`nextLegMode`). */
  readonly nextMode: LegMode | null;
  /** The official aires (ADR 0035) the edits' snap offers may go to: empty until they load. */
  readonly officialAires: readonly OfficialAire[];
  /** How many times the trip was replaced (New trip, Open trip): the map fits the trip when it changes (#241). */
  readonly tripGeneration: number;
  /** Your access points (ADR 0023): the session is their only writer; the planner stores them. */
  readonly accessPoints: AccessPoints;
  /** The new access point placed on the map while editing and not stored yet (the draft), or null. */
  readonly draft: AccessPoint | null;
  /** The id of the selected access point while editing, or null. */
  readonly selectedAccessPoint: string | null;
};

/** What the planner passes with an action that creates or changes an access point: the core stays pure. */
type Stamp = { readonly now: Timestamp };
type NewStamp = Stamp & { readonly newId: string };

/** Access point editing's actions (#242): they apply only while editing access points. */
export type AccessPointAction =
  /** The mark button places the draft at your position, or moves it there. */
  | ({ readonly type: "draftPlaced"; readonly at: LatLng } & NewStamp)
  /** The draft was dragged. */
  | ({ readonly type: "draftMoved"; readonly to: LatLng } & Stamp)
  /** Stores the draft with its details and selects it. */
  | ({ readonly type: "draftSaved"; readonly changes: AccessPointChanges } & Stamp)
  | { readonly type: "draftDiscarded" }
  /** A tap on an access point's marker or row selects it. */
  | { readonly type: "accessPointClicked"; readonly id: string }
  /** An access point's marker was dragged. */
  | ({ readonly type: "accessPointMoved"; readonly id: string; readonly to: LatLng } & Stamp)
  /** An access point's details were saved. */
  | ({ readonly type: "accessPointUpdated"; readonly id: string; readonly changes: AccessPointChanges } & Stamp)
  | { readonly type: "accessPointDeleted"; readonly id: string };

export type PlannerAction =
  /** Adds a point; its leg has the next leg's mode (`nextLegMode`). */
  | { readonly type: "addPoint"; readonly at: LatLng }
  | { readonly type: "movePoint"; readonly index: number; readonly to: LatLng }
  /** Adds a leg from the last point back to the start (GLOSSARY "Loop"), in the next leg's mode. */
  | { readonly type: "backToStart" }
  | { readonly type: "deleteSelectedPoint" }
  /** Inserts a point on leg `leg` of the route, nearest to `near` (#122). */
  | { readonly type: "insertPoint"; readonly index: number; readonly near: LatLng }
  | { readonly type: "setLegMode"; readonly index: number; readonly mode: LegMode }
  | { readonly type: "toggleCampOnSelectedPoint" }
  | { readonly type: "undo" }
  | { readonly type: "rename"; readonly name: string }
  | { readonly type: "setStartDate"; readonly date: CalendarDate | undefined }
  | { readonly type: "retryLeg"; readonly index: number }
  | { readonly type: "pointClicked"; readonly index: number }
  /** A tap on a leg on the map (#230). */
  | { readonly type: "legClicked"; readonly index: number }
  | { readonly type: "deselect" }
  /**
   * A tap on the free map (#120, #230, #227): places or moves the draft while editing access
   * points, else clears the selection, else adds a point. `newId` and `now` are for a new draft.
   */
  | ({ readonly type: "mapTapped"; readonly at: LatLng } & NewStamp)
  | { readonly type: "acceptOffer"; readonly offer: SnapOffer }
  | { readonly type: "declineOffer"; readonly offer: SnapOffer }
  /** A new trip, starting on `startDate` when given (the planner passes today; #124). */
  | { readonly type: "newTrip"; readonly startDate?: CalendarDate }
  | { readonly type: "fileOpened"; readonly trip: Trip }
  | { readonly type: "fileRejected"; readonly reason: FileError }
  | { readonly type: "confirmReplace" }
  | { readonly type: "cancelReplace" }
  | { readonly type: "fileDownloaded" }
  /** Enters access point editing; Done returns to `returnTo`. */
  | { readonly type: "enterAccessPointEditing"; readonly returnTo: PanelView }
  /** Done: back to normal mode. */
  | { readonly type: "leaveAccessPointEditing" }
  /** The planner picked the next leg's mode (#121): no edit, no undo step. */
  | { readonly type: "nextModePicked"; readonly mode: LegMode }
  /** The built-in official aires arrived (they load once the trip has a point). */
  | { readonly type: "officialAiresLoaded"; readonly aires: readonly OfficialAire[] }
  /** The default name looked up for access point `id` at `at` (ADR 0027): for a stored point or the draft. */
  | { readonly type: "defaultNameFound"; readonly id: string; readonly at: LatLng; readonly name: string }
  | AccessPointAction
  | RoutingAction;

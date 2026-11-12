import type { ReactNode } from "react";
import type { TripSummary } from "@/core/summarise";
import { BottomSheet } from "../components/BottomSheet";
import { SidePanel } from "../components/SidePanel";
import { Tab, TabList, Tabs } from "../components/Tabs";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import { strings } from "../strings";
import TripTotals from "./TripTotals";
import type { Panel } from "./usePanel";

type TabName = keyof typeof strings.planner.tabs;

export type PlannerPanelProps<T extends TabName> = {
  panel: Panel;
  totals: TripSummary["trip"];
  tabs: readonly T[];
  tab: T;
  onTabChange: (tab: T) => void;
  /** One `TabPanel` per tab. */
  children: ReactNode;
};

/**
 * The planner's content, in the bottom sheet or the side panel: the trip's totals, the tabs and
 * their panels. The same content either way.
 */
export default function PlannerPanel<T extends TabName>({
  panel,
  totals,
  tabs,
  tab,
  onTabChange,
  children,
}: PlannerPanelProps<T>) {
  const summary = (
    <div className="planner-peek-summary">
      <TripTotals trip={totals} />
    </div>
  );
  const tabList = (
    <TabList label={strings.planner.tabsLabel}>
      {tabs.map((value) => (
        <Tab key={value} value={value} onPress={panel.raiseFromPeek}>
          {strings.planner.tabs[value]}
        </Tab>
      ))}
    </TabList>
  );
  const content = <div className="planner-tab-panels">{children}</div>;

  return (
    <Tabs value={tab} onChange={onTabChange}>
      {panel.sideways ? (
        <SidePanel
          label={strings.planner.sheetLabel}
          open={panel.open}
          onOpenChange={panel.setOpen}
          width={panel.width}
          onWidthChange={panel.setWidth}
          resizeLabel={strings.planner.resizePanelHandle}
          collapseLabel={strings.planner.collapsePanelButton}
          collapseIcon={<Icon icon={icons.collapsePanel} />}
          expandLabel={strings.planner.expandPanelButton}
          expandIcon={<Icon icon={icons.expandPanel} />}
          summary={summary}
          header={tabList}
        >
          {content}
        </SidePanel>
      ) : (
        <BottomSheet
          label={strings.planner.sheetLabel}
          handleLabel={strings.planner.resizeSheetHandle}
          stopLabels={strings.planner.sheetStops}
          stop={panel.stop}
          onStopChange={panel.setStop}
          onPeekHeightChange={panel.setPeekPx}
          peek={
            <>
              {summary}
              {tabList}
            </>
          }
        >
          {content}
        </BottomSheet>
      )}
    </Tabs>
  );
}

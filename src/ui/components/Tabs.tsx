import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";
import "./Tabs.css";

export type TabsProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  children: ReactNode;
};

/** Tabs (Base UI Tabs, ADR 0020): a `TabList` and one `TabPanel` per tab, anywhere under this. */
export function Tabs<T extends string>({ value, onChange, children }: TabsProps<T>) {
  return (
    <BaseTabs.Root className="tabs" value={value} onValueChange={(next) => onChange(next as T)}>
      {children}
    </BaseTabs.Root>
  );
}

/** The row of tabs, sharing its width equally. */
export function TabList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <BaseTabs.List
      className="tab-list"
      aria-label={label}
    >
      {children}
    </BaseTabs.List>
  );
}

export type TabProps = {
  value: string;
  /** Called on every press, also on the tab that is already selected. */
  onPress?: () => void;
  children: ReactNode;
};

export function Tab({ value, onPress, children }: TabProps) {
  return (
    <BaseTabs.Tab className="tab" value={value} onClick={onPress}>
      {children}
    </BaseTabs.Tab>
  );
}

export function TabPanel({ value, children }: { value: string; children?: ReactNode }) {
  return (
    <BaseTabs.Panel className="tab-panel" value={value}>
      {children}
    </BaseTabs.Panel>
  );
}

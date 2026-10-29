"use client";
// PROTOTYPE, throw away (branch prototype/menu-toggle-variants).
// Question: how should the Map menu's on/off toggles look? Four variants of the toggle row
// in the real Menu, switchable via `?toggle=A|B|C|D` and the floating bar (← → keys too).

import { useEffect, useSyncExternalStore } from "react";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";

export const toggleVariants = {
  A: "Bigger switch, white thumb",
  B: "Checkmark in the icon slot",
  C: "Eye icon, label dims when off",
  D: "On / Off text chip",
} as const;
export type ToggleVariant = keyof typeof toggleVariants;
const keys = Object.keys(toggleVariants) as ToggleVariant[];

const listeners = new Set<() => void>();
function read(): ToggleVariant {
  const v = new URLSearchParams(window.location.search).get("toggle")?.toUpperCase();
  return keys.includes(v as ToggleVariant) ? (v as ToggleVariant) : "A";
}
function write(v: ToggleVariant) {
  const url = new URL(window.location.href);
  url.searchParams.set("toggle", v);
  window.history.replaceState(null, "", url);
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useToggleVariant(): ToggleVariant {
  return useSyncExternalStore(subscribe, read, () => "A");
}

/** What a toggle row draws, per variant: before the label (`lead`) and after it (`trail`). */
export function toggleParts(variant: ToggleVariant, checked: boolean) {
  switch (variant) {
    case "A":
      return {
        lead: <span className="menu-item-icon" />,
        trail: (
          <span className="proto-a-track" aria-hidden>
            <span className="proto-a-thumb" />
          </span>
        ),
      };
    case "B":
      return { lead: <span className="menu-item-icon proto-b-check">{checked && <Icon icon={icons.protoCheck} />}</span>, trail: null };
    case "C":
      return {
        lead: <span className="menu-item-icon proto-c-eye">{<Icon icon={checked ? icons.protoEye : icons.protoEyeOff} />}</span>,
        trail: null,
      };
    case "D":
      return { lead: <span className="menu-item-icon" />, trail: <span className="proto-d-chip">{checked ? "On" : "Off"}</span> };
  }
}

export function ToggleVariantSwitcher() {
  const variant = useToggleVariant();
  const step = (d: number) => write(keys[(keys.indexOf(variant) + d + keys.length) % keys.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable], [role=menu]")) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="proto-switcher">
      <button onClick={() => step(-1)}>←</button>
      <span>
        {variant} ({toggleVariants[variant]})
      </span>
      <button onClick={() => step(1)}>→</button>
    </div>
  );
}

"use client";

// PROTOTYPE (#169): throwaway, never merged. A floating bar to flip between ?variant= keys;
// ← and → also cycle (not while typing). Hidden in production builds.

import { useEffect, useState } from "react";
import "./PrototypeSwitcher.css";

export function useVariant<V extends string>(keys: readonly V[]): [V, (v: V) => void] {
  const read = () => {
    const v = new URLSearchParams(window.location.search).get("variant") as V | null;
    return v && keys.includes(v) ? v : keys[0];
  };
  const [variant, setVariant] = useState<V>(read);
  const change = (v: V) => {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", v);
    window.history.replaceState(null, "", url);
    setVariant(v);
  };
  return [variant, change];
}

export function PrototypeSwitcher<V extends string>({
  keys,
  names,
  current,
  onChange,
}: {
  keys: readonly V[];
  names: Record<V, string>;
  current: V;
  onChange: (v: V) => void;
}) {
  const step = (by: number) => onChange(keys[(keys.indexOf(current) + by + keys.length) % keys.length]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="prototype-switcher" role="toolbar" aria-label="Prototype variant">
      <button type="button" onClick={() => step(-1)} aria-label="Previous variant">
        ←
      </button>
      <span>
        {current} ({names[current]})
      </span>
      <button type="button" onClick={() => step(1)} aria-label="Next variant">
        →
      </button>
    </div>
  );
}

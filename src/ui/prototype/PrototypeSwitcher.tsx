"use client";

// PROTOTYPE, throwaway: the floating variant switcher for UI prototypes (`?variant=`).
// Hidden in production builds.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export type PrototypeVariant = { key: string; name: string };

/** The `?variant=` key, the first variant when none or an unknown one is given. */
export function useVariant(variants: readonly PrototypeVariant[]): string {
  const key = useSearchParams().get("variant");
  return variants.some((v) => v.key === key) ? key! : variants[0].key;
}

export function PrototypeSwitcher({ variants, current }: { variants: readonly PrototypeVariant[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const index = Math.max(0, variants.findIndex((v) => v.key === current));
  const go = (step: number) => {
    const next = variants[(index + step + variants.length) % variants.length];
    const search = new URLSearchParams(params.toString());
    search.set("variant", next.key);
    router.replace(`${pathname}?${search.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable], [role=toolbar], [role=group], [role=menu]")) return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;
  const shown = variants[index];
  const button = { background: "none", border: 0, color: "inherit", font: "inherit", fontSize: 18, padding: "4px 10px", cursor: "pointer" };
  return (
    <div
      style={{
        position: "fixed",
        top: 64,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100000,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 6px",
        borderRadius: 999,
        background: "#111",
        color: "#ff0",
        font: "600 13px/1.2 system-ui, sans-serif",
        boxShadow: "0 4px 16px rgba(0,0,0,.4)",
        whiteSpace: "nowrap",
      }}
    >
      <button type="button" style={button} onClick={() => go(-1)} aria-label="Previous prototype variant">
        ←
      </button>
      <span>
        PROTOTYPE {shown.key} ({shown.name})
      </span>
      <button type="button" style={button} onClick={() => go(1)} aria-label="Next prototype variant">
        →
      </button>
    </div>
  );
}

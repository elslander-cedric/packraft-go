import type { Layer, Map as LeafletMap } from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type { LatLng } from "@/core/trip";

/** How long a finger or the mouse holds a map shape (a leg to insert a point, #122; a water for its details, #125). */
export const HOLD_MS = 400;

// A finger or mouse that moves more than this (in screen pixels) while held is panning, not holding.
const HOLD_SLOP_PX = 8;

/** A press that can start a hold or a tap: a finger, a pen, or the left mouse button. */
export const isPrimaryPress = (event: PointerEvent) => event.pointerType !== "mouse" || event.button === 0;

/**
 * Hold on a map shape's element (ADR 0026): a finger, pen or the left mouse
 * button held still for `HOLD_MS` calls `onHold` with where it was pressed
 * (the same gesture for touch and mouse, ADR 0034), timed by our own timer:
 * Leaflet's `contextmenu` is not reliable for touch (#112). A right-click calls
 * it at once. The shape's own `contextmenu` never opens the browser's menu, and
 * the one a long touch press can give is ignored (the timer already handled
 * it). Nothing is stopped: a tap on the shape is still a tap on the map, and a
 * finger or mouse that moves still pans it. The click that ends a hold is ignored
 * by the map's tap handling (see `TripMap`). Returns a function that stops
 * listening.
 */
export function listenForHold(element: Element, map: LeafletMap, onHold: (at: LatLng) => void): () => void {
  let pressed: { id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null;
  let lastPointerType = "mouse";
  const at = (event: MouseEvent): LatLng => {
    const { lat, lng } = map.mouseEventToLatLng(event);
    return { lat, lng };
  };
  const release = () => {
    if (pressed) clearTimeout(pressed.timer);
    pressed = null;
  };

  const down = (event: PointerEvent) => {
    lastPointerType = event.pointerType;
    if (!isPrimaryPress(event) || pressed) return;
    const where = at(event);
    pressed = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        pressed = null;
        onHold(where);
      }, HOLD_MS),
    };
  };
  const move = (event: PointerEvent) => {
    if (pressed?.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > HOLD_SLOP_PX) release();
  };
  const up = (event: PointerEvent) => {
    if (pressed?.id === event.pointerId) release();
  };
  const contextMenu = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    const mouse = event as PointerEvent;
    const pointerType = mouse.pointerType || lastPointerType;
    if (pointerType === "mouse") onHold(at(mouse));
  };

  // Moves, lifts and cancels are watched on the document: Leaflet may capture the pointer to pan.
  const listeners: [EventTarget, string, EventListener][] = [
    [element, "pointerdown", down as EventListener],
    [document, "pointermove", move as EventListener],
    [document, "pointerup", up as EventListener],
    [document, "pointercancel", up as EventListener],
    [element, "contextmenu", contextMenu],
  ];
  for (const [target, type, listener] of listeners) target.addEventListener(type, listener);
  return () => {
    release();
    for (const [target, type, listener] of listeners) target.removeEventListener(type, listener);
  };
}

/**
 * Hold on a map layer's element (see `listenForHold`), with this render's `onHold`.
 * A layer in a group that joins the map after it (the access layer's waters) has no element yet
 * when it mounts: then it starts listening once the layer is added to the map.
 */
export function useHold(
  layer: { readonly current: Pick<Layer, "on" | "off"> & { getElement(): Element | undefined } | null },
  onHold: (at: LatLng) => void,
) {
  const map = useMap();
  const latest = useRef(onHold);
  useEffect(() => {
    latest.current = onHold;
  });
  useEffect(() => {
    const current = layer.current;
    if (!current) return;
    let stop: (() => void) | undefined;
    const listen = () => {
      const element = current.getElement();
      if (!element || stop) return;
      stop = listenForHold(element, map, (at) => latest.current(at));
    };
    listen();
    current.on("add", listen);
    return () => {
      current.off("add", listen);
      stop?.();
    };
  }, [map, layer]);
}

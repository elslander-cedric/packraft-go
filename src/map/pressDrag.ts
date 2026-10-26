import type { Map as LeafletMap } from "leaflet";
import { useEffect, useRef, type DependencyList } from "react";
import { useMap } from "react-leaflet";
import type { LatLng } from "@/core/trip";

/** What a press on a point turned out to be. */
export type PressDragHandlers = {
  /** The press ended where it started: a tap (or a click). */
  onTap: () => void;
  /** The pointer moved while pressed: the point is being dragged to `to`. */
  onDrag: (to: LatLng) => void;
  /** The drag ended: drop the point at `to`. */
  onDrop: (to: LatLng) => void;
  /** The drag was cancelled by the browser: put the point back. */
  onCancel: () => void;
};

/** A point's finger-sized hit area, in screen pixels across (#120, story 43). */
export const HIT_SIZE_PX = 44;

// A press that moves less than this (in screen pixels) is a tap, not a drag; a finger wobbles more than a mouse.
const TAP_SLOP_PX = { mouse: 3, touch: 8 } as const;

/**
 * Press-and-drag on a point's own element (#120, research #105): Leaflet 1.9
 * listens to touch events on phones and its path drag is mouse-only, so this
 * uses pointer events with pointer capture, for a finger, a mouse or a pen.
 * The point's `touchstart`, `mousedown` and `click` are stopped, so Leaflet
 * never pans the map for a press that grabbed a point, nor reads the click that
 * ends it as a tap on the map. Panning the page is already off: Leaflet sets
 * `touch-action: none` on the map. `handlers` is read on every event, so it
 * can be the latest render's. Returns a function that stops listening.
 */
export function listenForPressDrag(element: Element, map: LeafletMap, handlers: () => PressDragHandlers): () => void {
  const stopPropagation = (event: Event) => event.stopPropagation();
  let pressed: {
    id: number;
    x: number;
    y: number;
    slop: number;
    to: LatLng | null;
  } | null = null;

  const down = (event: PointerEvent) => {
    if (pressed || (event.pointerType === "mouse" && event.button !== 0)) return;
    pressed = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      slop: event.pointerType === "mouse" ? TAP_SLOP_PX.mouse : TAP_SLOP_PX.touch,
      to: null,
    };
    element.setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (pressed?.id !== event.pointerId) return;
    const far = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
    if (!pressed.to && far < pressed.slop) return;
    const { lat, lng } = map.mouseEventToLatLng(event);
    pressed.to = { lat, lng };
    handlers().onDrag(pressed.to);
  };
  const up = (event: PointerEvent) => {
    if (pressed?.id !== event.pointerId) return;
    const { to } = pressed;
    pressed = null;
    if (to) handlers().onDrop(to);
    else handlers().onTap();
  };
  const cancel = (event: PointerEvent) => {
    if (pressed?.id !== event.pointerId) return;
    const dragged = pressed.to !== null;
    pressed = null;
    if (dragged) handlers().onCancel();
  };

  const listeners: [string, EventListener][] = [
    ["pointerdown", down as EventListener],
    ["pointermove", move as EventListener],
    ["pointerup", up as EventListener],
    ["pointercancel", cancel as EventListener],
    ["lostpointercapture", cancel as EventListener],
    ["touchstart", stopPropagation],
    ["mousedown", stopPropagation],
    ["click", stopPropagation],
  ];
  for (const [type, listener] of listeners) element.addEventListener(type, listener);
  return () => {
    for (const [type, listener] of listeners) element.removeEventListener(type, listener);
  };
}

/**
 * Press-and-drag on a map layer's element, with this render's `handlers`.
 * Listens again whenever `deps` change (e.g. a marker's new icon replaces its element).
 */
export function usePressDrag(
  layer: { current: { getElement(): Element | undefined } | null },
  handlers: PressDragHandlers,
  deps: DependencyList = [],
) {
  const map = useMap();
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    const element = layer.current?.getElement();
    return element ? listenForPressDrag(element, map, () => latest.current) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller says when the element changes
  }, [map, layer, ...deps]);
}

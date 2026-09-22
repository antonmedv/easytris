import { useSyncExternalStore } from "react";

import type { InputType } from "./Overlay.tsx";

function query(mediaQuery: string): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia(mediaQuery) : null;
}

/** Whether a media query currently matches; false where matchMedia is missing. */
export function useMediaQuery(mediaQuery: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = query(mediaQuery);
      if (list === null) return () => {};
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => query(mediaQuery)?.matches ?? false,
    () => false,
  );
}

/** Coarse pointers get touch hints and gestures; everything else is keyboard-first. */
export function useInputType(): InputType {
  return useMediaQuery("(pointer: coarse)") ? "touch" : "keyboard";
}

/** For the one-shot animations CSS cannot see; the rest honor it themselves. */
export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

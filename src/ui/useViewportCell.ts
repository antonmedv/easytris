import { useEffect, useState } from "react";
import type { RefObject } from "react";

import { COLS } from "../engine/config.ts";

/**
 * The rendered size of one board cell in CSS pixels. CSS decides the size; this
 * only reads it back for gesture math.
 */
export function useViewportCell(boardRef: RefObject<HTMLElement | null>): number {
  const [cellPx, setCellPx] = useState(0);
  useEffect(() => {
    const element = boardRef.current;
    if (element === null) return;
    const measure = () => setCellPx(element.getBoundingClientRect().width / COLS);
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [boardRef]);
  return cellPx;
}

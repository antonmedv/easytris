import { useEffect } from "react";

import { MAX_FRAME_DT_MS } from "../engine/config.ts";

/**
 * Calls onFrame once per animation frame with the elapsed time, clamped so a
 * stalled tab never simulates a huge jump at once. While `running` is false no
 * frame is requested at all, so a game sitting on its ready or game-over card
 * stops waking the compositor.
 */
export function useGameLoop(onFrame: (now: number, dtMs: number) => void, running: boolean): void {
  useEffect(() => {
    if (!running) return;
    let last: number | null = null;
    let handle = requestAnimationFrame(function frame(now: number) {
      const dtMs = last === null ? 0 : Math.min(MAX_FRAME_DT_MS, Math.max(0, now - last));
      last = now;
      onFrame(now, dtMs);
      handle = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(handle);
  }, [onFrame, running]);
}

import type { GameEvent } from "../engine/types.ts";

type Vibrator = {
  readonly vibrate?: (pattern: number | number[]) => boolean;
};

/** Vibration pattern for an event, or null when the event should stay silent. */
export function patternFor(event: GameEvent): number | number[] | null {
  switch (event.type) {
    case "lock":
      return 10;
    case "clear":
      return event.rows.length >= 4 ? [20, 30, 20] : 20;
    case "gameOver":
      return [40, 40, 40];
    default:
      return null;
  }
}

export function vibrateFor(event: GameEvent, vibrator: Vibrator = navigator): void {
  const pattern = patternFor(event);
  if (pattern === null || typeof vibrator.vibrate !== "function") return;
  try {
    vibrator.vibrate(pattern);
  } catch {
    // Some browsers throw outside a user gesture; feedback never affects gameplay.
  }
}

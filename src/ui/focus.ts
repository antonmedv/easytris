import type { MouseEvent as ReactMouseEvent } from "react";

/**
 * A pointer click leaves focus on the button, where Space would toggle it again
 * instead of reaching the game. Keyboard activation (detail 0) keeps its focus,
 * because taking it away is how a keyboard user loses their place.
 */
export function releaseAfterPointer(event: ReactMouseEvent<HTMLButtonElement>): void {
  if (event.detail > 0) event.currentTarget.blur();
}

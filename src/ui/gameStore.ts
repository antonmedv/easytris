import { reduce } from "../engine/game.ts";
import type { Action, GameEvent, GameState } from "../engine/types.ts";

export type GameStore = {
  getState(): GameState;
  /** Applies the actions in order and notifies once if anything visible changed. */
  dispatch(...actions: readonly Action[]): void;
  subscribe(listener: () => void): () => void;
};

/**
 * Whether the UI needs to render. Accumulators change every frame, so a
 * plain reference check would re-render on idle frames.
 */
export function isVisibleChange(prev: GameState, next: GameState): boolean {
  return (
    prev.phase !== next.phase ||
    prev.board !== next.board ||
    prev.active !== next.active ||
    prev.linesCleared !== next.linesCleared ||
    prev.clearing?.rows !== next.clearing?.rows ||
    // Not a board change, but the overlay draws which supply is selected.
    prev.selector.classic !== next.selector.classic ||
    next.events.length > 0
  );
}

export function createGameStore(initial: GameState): GameStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch(...actions) {
      const before = state;
      const batch: GameEvent[] = [];
      for (const action of actions) {
        state = reduce(state, action);
        batch.push(...state.events);
      }
      // Each reduce replaces the event list, so carry the whole batch forward:
      // a shift followed by a tick must still reach the listeners as a shift.
      if (batch.length !== state.events.length) state = { ...state, events: batch };
      if (state !== before && isVisibleChange(before, state)) {
        for (const listener of listeners) listener();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

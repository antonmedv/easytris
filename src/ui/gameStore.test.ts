import { describe, expect, it, vi } from "vitest";

import { NO_EVENTS } from "../engine/game.ts";
import { gravityMs } from "../engine/gravity.ts";
import { seedFor, startGame } from "../engine/testing.ts";
import type { GameEvent } from "../engine/types.ts";
import { createGameStore, isVisibleChange } from "./gameStore.ts";

describe("createGameStore", () => {
  it("does not notify on a tick that only advances accumulators", () => {
    const store = createGameStore(startGame(1));
    const listener = vi.fn<() => void>();
    store.subscribe(listener);

    store.dispatch({ type: "tick", dtMs: 10 });

    expect(listener).not.toHaveBeenCalled();
    expect(store.getState().gravityAcc).toBe(10);
  });

  it("notifies when a tick moves the piece", () => {
    const store = createGameStore(startGame(1));
    const listener = vi.fn<() => void>();
    store.subscribe(listener);
    const before = store.getState().active;

    store.dispatch({ type: "tick", dtMs: gravityMs(0) });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().active).not.toBe(before);
  });

  it("notifies on a successful shift and not on a blocked one", () => {
    const store = createGameStore(startGame(1));
    const listener = vi.fn<() => void>();
    store.subscribe(listener);

    store.dispatch({ type: "shift", dx: 1 });
    expect(listener).toHaveBeenCalledTimes(1);

    store.dispatch({ type: "tick", dtMs: 1 }); // clears the shift event without visible change
    for (let i = 0; i < 12; i++) store.dispatch({ type: "shift", dx: 1 });
    const calls = listener.mock.calls.length;
    store.dispatch({ type: "shift", dx: 1 }); // now against the wall
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it("applies several actions with a single notification", () => {
    const store = createGameStore(startGame(seedFor("T")));
    const listener = vi.fn<() => void>();
    store.subscribe(listener);

    store.dispatch({ type: "shift", dx: 1 }, { type: "rotate", dir: 1 }, { type: "tick", dtMs: 5 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().active?.rotation).toBe(1);
  });

  it("reports the events of every action in a batch, not just the last", () => {
    const store = createGameStore(startGame(seedFor("T")));
    const seen: GameEvent[] = [];
    store.subscribe(() => seen.push(...store.getState().events));

    // A tick carries no events of its own, and must not erase the shift's.
    store.dispatch({ type: "shift", dx: 1 }, { type: "tick", dtMs: 5 });

    expect(seen.map((event) => event.type)).toEqual(["shift"]);
  });

  it("keeps the shared empty list when a batch produces no events", () => {
    const store = createGameStore(startGame(seedFor("T")));
    store.dispatch({ type: "tick", dtMs: 5 }, { type: "tick", dtMs: 5 });
    expect(store.getState().events).toBe(NO_EVENTS);
  });

  it("stops notifying after unsubscribe", () => {
    const store = createGameStore(startGame(1));
    const listener = vi.fn<() => void>();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();

    store.dispatch({ type: "shift", dx: 1 });

    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies on phase changes", () => {
    const store = createGameStore(startGame(1));
    const listener = vi.fn<() => void>();
    store.subscribe(listener);
    store.dispatch({ type: "pause" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().phase).toBe("paused");
  });
});

describe("isVisibleChange", () => {
  it("ignores clearing progress but reacts to new clearing rows", () => {
    const base = startGame(1);
    const clearingA = { ...base, clearing: { rows: [21], elapsed: 0 }, events: [] };
    const clearingB = { ...clearingA, clearing: { rows: clearingA.clearing.rows, elapsed: 50 } };
    expect(isVisibleChange(clearingA, clearingB)).toBe(false);
    expect(isVisibleChange(base, clearingA)).toBe(true);
  });
});

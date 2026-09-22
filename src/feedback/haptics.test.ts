import { describe, expect, it, vi } from "vitest";

import type { GameEvent } from "../engine/types.ts";
import { patternFor, vibrateFor } from "./haptics.ts";

describe("patternFor", () => {
  it("maps lock, line clears and game over to the spec patterns", () => {
    expect(patternFor({ type: "lock", cells: [] })).toBe(10);
    expect(patternFor({ type: "clear", rows: [21] })).toBe(20);
    expect(patternFor({ type: "clear", rows: [19, 20, 21] })).toBe(20);
    expect(patternFor({ type: "clear", rows: [18, 19, 20, 21] })).toEqual([20, 30, 20]);
    expect(patternFor({ type: "gameOver" })).toEqual([40, 40, 40]);
  });

  it("has no pattern for movement, spawn, hard drop or level up", () => {
    const silent: GameEvent[] = [
      { type: "shift" },
      { type: "rotate" },
      { type: "spawn" },
      { type: "hardDrop", distance: 3 },
      { type: "levelUp", level: 2 },
    ];
    for (const event of silent) expect(patternFor(event)).toBeNull();
  });
});

describe("vibrateFor", () => {
  it("calls navigator.vibrate with the pattern for mapped events only", () => {
    const vibrate = vi.fn<(pattern: number | number[]) => boolean>(() => true);
    vibrateFor({ type: "lock", cells: [] }, { vibrate });
    vibrateFor({ type: "shift" }, { vibrate });
    vibrateFor({ type: "clear", rows: [18, 19, 20, 21] }, { vibrate });
    expect(vibrate.mock.calls).toEqual([[10], [[20, 30, 20]]]);
  });

  it("does nothing, without throwing, when vibrate is missing or throws", () => {
    expect(() => vibrateFor({ type: "lock", cells: [] }, {})).not.toThrow();
    const throwing = {
      vibrate: () => {
        throw new Error("nope");
      },
    };
    expect(() => vibrateFor({ type: "gameOver" }, throwing)).not.toThrow();
  });
});

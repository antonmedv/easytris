import { describe, expect, it } from "vitest";

import { ARR_MS, DAS_MS, MAX_FRAME_DT_MS } from "../engine/config.ts";
import { createKeyboard, isGameKey, keyDown, keyUp, tick } from "./keyboard.ts";
import type { KeyboardState } from "./keyboard.ts";

/** Runs a sequence of keyboard steps and returns the commands each produced. */
function drive(
  steps: readonly (readonly ["down" | "up" | "tick", string | null, number])[],
): ReturnType<typeof keyDown>[1][] {
  let state: KeyboardState = createKeyboard();
  const outputs: ReturnType<typeof keyDown>[1][] = [];
  for (const [kind, key, t] of steps) {
    const [next, commands] =
      kind === "tick"
        ? tick(state, t)
        : kind === "down"
          ? keyDown(state, key ?? "", t)
          : keyUp(state, key ?? "", t);
    state = next;
    outputs.push(commands);
  }
  return outputs;
}

describe("held direction (DAS and ARR)", () => {
  it("shifts once at once, waits DAS_MS, then repeats every ARR_MS", () => {
    const out = drive([
      ["down", "ArrowRight", 0],
      ["tick", null, DAS_MS - 1],
      ["tick", null, DAS_MS],
      ["tick", null, DAS_MS + ARR_MS - 1],
      ["tick", null, DAS_MS + ARR_MS],
      ["tick", null, DAS_MS + ARR_MS * 3],
    ]);
    expect(out).toEqual([
      [{ type: "shift", dx: 1 }],
      [],
      [{ type: "shift", dx: 1 }],
      [],
      [{ type: "shift", dx: 1 }],
      [
        { type: "shift", dx: 1 },
        { type: "shift", dx: 1 },
      ],
    ]);
  });

  it("does not empty the repeat backlog into a single stalled frame", () => {
    const out = drive([
      ["down", "ArrowRight", 0],
      ["tick", null, 2000], // a long task, a throttled rAF: one frame, two seconds
    ]);

    // MAX_FRAME_DT_MS of catch-up, the same budget gravity gets, not 2000 ms of it.
    expect(out[1]).toHaveLength(MAX_FRAME_DT_MS / ARR_MS + 1);
  });

  it("keeps repeating in phase after a stall", () => {
    const out = drive([
      ["down", "ArrowRight", 0],
      ["tick", null, 2000],
      ["tick", null, 2000 + ARR_MS],
    ]);
    expect(out[2]).toEqual([{ type: "shift", dx: 1 }]);
  });

  it("stops repeating when the held key is released", () => {
    const out = drive([
      ["down", "ArrowLeft", 0],
      ["up", "ArrowLeft", 100],
      ["tick", null, DAS_MS + 500],
    ]);
    expect(out).toEqual([[{ type: "shift", dx: -1 }], [], []]);
  });

  it("lets the newest direction win and reverts to the other held key after a fresh DAS", () => {
    const out = drive([
      ["down", "ArrowRight", 0],
      ["down", "ArrowLeft", 50],
      ["tick", null, 50 + DAS_MS],
      ["up", "ArrowLeft", 300],
      ["tick", null, 300 + DAS_MS - 1],
      ["tick", null, 300 + DAS_MS],
    ]);
    expect(out).toEqual([
      [{ type: "shift", dx: 1 }],
      [{ type: "shift", dx: -1 }],
      [{ type: "shift", dx: -1 }],
      [],
      [],
      [{ type: "shift", dx: 1 }],
    ]);
  });

  it("ignores a repeated keydown for a key that is already held", () => {
    const out = drive([
      ["down", "ArrowRight", 0],
      ["down", "ArrowRight", 30],
      ["down", "ArrowRight", 60],
      ["tick", null, 100],
    ]);
    expect(out).toEqual([[{ type: "shift", dx: 1 }], [], [], []]);
  });
});

describe("other keys", () => {
  it("turns soft drop on while ArrowDown is held and off on release, ignoring repeats", () => {
    const out = drive([
      ["down", "ArrowDown", 0],
      ["down", "ArrowDown", 30],
      ["up", "ArrowDown", 200],
    ]);
    expect(out).toEqual([[{ type: "softDrop", on: true }], [], [{ type: "softDrop", on: false }]]);
  });

  it("maps rotation, hard drop, confirm and pause keys", () => {
    const out = drive([
      ["down", "ArrowUp", 0],
      ["down", "x", 1],
      ["down", "z", 2],
      ["down", " ", 3],
      ["down", "Enter", 4],
      ["down", "p", 5],
      ["down", "Escape", 6],
    ]);
    expect(out).toEqual([
      [{ type: "rotate", dir: 1 }],
      [{ type: "rotate", dir: 1 }],
      [{ type: "rotate", dir: -1 }],
      [{ type: "hardDrop" }, { type: "confirm" }],
      [{ type: "confirm" }],
      [{ type: "togglePause" }],
      [{ type: "togglePause" }],
    ]);
  });

  it("treats letters case-insensitively so Shift does not break them", () => {
    const out = drive([
      ["down", "X", 0],
      ["up", "X", 1],
      ["down", "Z", 2],
      ["up", "z", 3],
      ["down", "P", 4],
    ]);
    expect(out).toEqual([
      [{ type: "rotate", dir: 1 }],
      [],
      [{ type: "rotate", dir: -1 }],
      [],
      [{ type: "togglePause" }],
    ]);
  });

  it("fires one-shot keys again after they are released", () => {
    const out = drive([
      ["down", "ArrowUp", 0],
      ["down", "ArrowUp", 10],
      ["up", "ArrowUp", 20],
      ["down", "ArrowUp", 30],
    ]);
    expect(out).toEqual([[{ type: "rotate", dir: 1 }], [], [], [{ type: "rotate", dir: 1 }]]);
  });

  it("does nothing for keys the game does not use", () => {
    const out = drive([
      ["down", "a", 0],
      ["down", "Shift", 1],
      ["up", "Tab", 2],
    ]);
    expect(out).toEqual([[], [], []]);
  });
});

describe("isGameKey", () => {
  it("is true only for mapped keys so the page only swallows those", () => {
    for (const key of [
      "ArrowLeft",
      "ArrowRight",
      "ArrowDown",
      "ArrowUp",
      " ",
      "x",
      "Z",
      "p",
      "Escape",
      "Enter",
    ]) {
      expect(isGameKey(key)).toBe(true);
    }
    for (const key of ["a", "Shift", "Tab", "F5", "Meta"]) {
      expect(isGameKey(key)).toBe(false);
    }
  });
});

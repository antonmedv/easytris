import { describe, expect, it } from "vitest";

import { STALE_POINTER_MS, TAP_MAX_MS } from "../engine/config.ts";
import type { Action } from "../engine/types.ts";
import {
  createRecognizer,
  pointerCancel,
  pointerDown,
  pointerMove,
  pointerUp,
} from "./gestures.ts";
import type { GestureContext, RecognizerState } from "./gestures.ts";

const CELL = 30;

/** Drives the recognizer like the app would, feeding back the column the piece ended up in. */
class Finger {
  state: RecognizerState = createRecognizer();
  emitted: Action[][] = [];
  activeCol: number | null;

  constructor(activeCol: number | null = 3) {
    this.activeCol = activeCol;
  }

  private ctx(): GestureContext {
    return { cellPx: CELL, activeCol: this.activeCol };
  }

  down(x: number, y: number, t: number, id = 1): this {
    this.state = pointerDown(this.state, id, { x, y, t });
    return this;
  }

  move(x: number, y: number, t: number, id = 1): Action[] {
    const [next, actions] = pointerMove(this.state, id, { x, y, t }, this.ctx());
    this.state = next;
    this.emitted.push(actions);
    return actions;
  }

  up(x: number, y: number, t: number, id = 1): Action[] {
    const [next, actions] = pointerUp(this.state, id, { x, y, t }, this.ctx());
    this.state = next;
    this.emitted.push(actions);
    return actions;
  }

  /** Applies emitted shifts as the engine would, stopping at a wall column. */
  follow(actions: Action[], wall?: number): void {
    for (const action of actions) {
      if (action.type === "shift" && this.activeCol !== null) {
        const next = this.activeCol + action.dx;
        if (wall === undefined || next !== wall) this.activeCol = next;
      }
    }
  }
}

const shift = (dx: -1 | 1): Action => ({ type: "shift", dx });
const ROTATE: Action = { type: "rotate", dir: 1 };
const DROP_STEP: Action = { type: "dropStep" };
const HARD_DROP: Action = { type: "hardDrop" };

describe("tap", () => {
  it("rotates clockwise on a short touch that stays inside the dead zone", () => {
    const finger = new Finger().down(100, 100, 0);
    expect(finger.move(103, 101, 60)).toEqual([]);
    expect(finger.up(104, 102, 120)).toEqual([ROTATE]);
  });

  it("does nothing on a long press", () => {
    const finger = new Finger().down(100, 100, 0);
    expect(finger.up(101, 100, TAP_MAX_MS + 50)).toEqual([]);
  });
});

describe("horizontal drag", () => {
  it("moves one column per cell of travel, three cells give three shifts", () => {
    const finger = new Finger(3).down(100, 100, 0);
    const first = finger.move(135, 102, 30);
    expect(first).toEqual([shift(1)]);
    finger.follow(first);
    const second = finger.move(190, 104, 60);
    expect(second).toEqual([shift(1), shift(1)]);
    finger.follow(second);
    expect(finger.activeCol).toBe(6);
    expect(finger.up(190, 104, 90)).toEqual([]);
  });

  it("re-anchors when the piece is blocked so the next cell of travel moves exactly one column", () => {
    const finger = new Finger(3).down(100, 100, 0);
    const toward = finger.move(160, 100, 30); // two cells right, but the wall stops it at 4
    expect(toward).toEqual([shift(1), shift(1)]);
    finger.follow(toward, 5);
    expect(finger.activeCol).toBe(4);

    expect(finger.move(190, 100, 60)).toEqual([]); // still pushing into the wall: re-anchored
    expect(finger.move(175, 100, 90)).toEqual([]); // half a cell back: nothing yet
    expect(finger.move(160, 100, 120)).toEqual([shift(-1)]); // a full cell back: one column
  });

  it("locks to the horizontal axis and ignores vertical travel afterwards", () => {
    const finger = new Finger(3).down(100, 100, 0);
    finger.follow(finger.move(140, 100, 30));
    expect(finger.move(140, 400, 60)).toEqual([]);
    expect(finger.up(140, 400, 80)).toEqual([]);
  });

  it("emits nothing when there is no active piece", () => {
    const finger = new Finger(null).down(100, 100, 0);
    expect(finger.move(160, 100, 30)).toEqual([]);
    expect(finger.up(160, 100, 60)).toEqual([]);
  });
});

describe("vertical drag", () => {
  it("soft drops one row per cell of slow downward travel and never on the way up", () => {
    const finger = new Finger().down(100, 100, 0);
    expect(finger.move(100, 135, 300)).toEqual([DROP_STEP]);
    expect(finger.move(100, 175, 700)).toEqual([DROP_STEP]);
    expect(finger.move(100, 150, 900)).toEqual([]);
    expect(finger.up(100, 150, 1200)).toEqual([]);
  });

  it("does nothing for an upward drag", () => {
    const finger = new Finger().down(100, 100, 0);
    expect(finger.move(100, 40, 100)).toEqual([]);
    expect(finger.up(100, 40, 400)).toEqual([]);
  });

  it("hard drops on a fast downward flick", () => {
    const finger = new Finger().down(100, 100, 0);
    finger.move(100, 120, 30);
    finger.move(100, 200, 60);
    expect(finger.up(100, 230, 80)).toEqual([HARD_DROP]);
  });

  it("hard drops when a slow drag ends in a flick", () => {
    const finger = new Finger().down(100, 100, 0);
    expect(finger.move(100, 130, 300)).toEqual([DROP_STEP]);
    expect(finger.move(100, 160, 600)).toEqual([DROP_STEP]);
    finger.move(100, 300, 650);
    expect(finger.up(100, 340, 670)).toEqual([HARD_DROP]);
  });

  it("does not hard drop a flick that travels less than the minimum", () => {
    const finger = new Finger().down(100, 100, 0);
    finger.move(100, 108, 5);
    expect(finger.up(100, 112, 10)).toEqual([]);
  });
});

describe("pointer bookkeeping", () => {
  it("tracks only the first pointer and ignores others", () => {
    const finger = new Finger().down(100, 100, 0);
    finger.down(300, 300, 10, 2);
    expect(finger.move(340, 300, 20, 2)).toEqual([]);
    expect(finger.up(340, 300, 30, 2)).toEqual([]);
    expect(finger.up(101, 100, 100)).toEqual([ROTATE]);
  });

  it("forgets the gesture on cancel", () => {
    const finger = new Finger().down(100, 100, 0);
    finger.state = pointerCancel(finger.state, 1);
    expect(finger.up(101, 100, 50)).toEqual([]);
  });

  it("is ready for a new gesture after a release", () => {
    const finger = new Finger().down(100, 100, 0);
    finger.up(101, 100, 50);
    finger.down(200, 200, 500);
    expect(finger.up(200, 200, 550)).toEqual([ROTATE]);
  });

  // The OS takes the gesture mid-drag -- app switcher, notification shade, a
  // call -- and the browser sends neither pointerup nor pointercancel. Held for
  // good, that pointer would make every touch after it a no-op, for the rest of
  // the session. The next touch takes over instead.
  it("hands the gesture to the next touch when a held pointer is never released", () => {
    const finger = new Finger().down(100, 100, 0);
    finger.move(140, 100, 20);

    finger.down(200, 200, STALE_POINTER_MS + 20, 2);
    expect(finger.up(201, 200, STALE_POINTER_MS + 60, 2)).toEqual([ROTATE]);
  });

  it("keeps the gesture of a finger that is still being heard from", () => {
    const finger = new Finger().down(100, 100, 0);
    for (let t = 20; t <= STALE_POINTER_MS + 200; t += 20) finger.move(100, 100, t);

    finger.down(300, 300, STALE_POINTER_MS + 210, 2);
    expect(finger.up(301, 300, STALE_POINTER_MS + 250, 2)).toEqual([]);
    expect(finger.state.pointerId).toBe(1);
  });
});

describe("before the board has been measured", () => {
  const unmeasured: GestureContext = { cellPx: 0, activeCol: 3 };

  it("ignores a sideways drag instead of asking for infinite shifts", () => {
    const down = pointerDown(createRecognizer(), 1, { x: 100, y: 100, t: 0 });
    const [next, actions] = pointerMove(down, 1, { x: 140, y: 100, t: 20 }, unmeasured);

    expect(actions).toEqual([]);
    expect(next.axis).toBe("none");
  });

  it("ignores a downward drag the same way", () => {
    const down = pointerDown(createRecognizer(), 1, { x: 100, y: 100, t: 0 });
    const [next, actions] = pointerMove(down, 1, { x: 100, y: 140, t: 20 }, unmeasured);

    expect(actions).toEqual([]);
    expect(next.axis).toBe("none");
  });

  it("still rotates on a tap, which needs no cell size", () => {
    const down = pointerDown(createRecognizer(), 1, { x: 100, y: 100, t: 0 });
    const [, actions] = pointerUp(down, 1, { x: 100, y: 100, t: 50 }, unmeasured);

    expect(actions).toEqual([{ type: "rotate", dir: 1 }]);
  });
});

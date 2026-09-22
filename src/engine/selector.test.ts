import { describe, expect, it } from "vitest";

import { spawnPiece } from "./board.ts";
import { MAX_REPEAT, STARVE_LIMIT } from "./config.ts";
import { createSelector, nextKind } from "./selector.ts";
import { boardFrom } from "./testing.ts";
import { KINDS } from "./tetrominoes.ts";
import type { Board, Kind } from "./types.ts";

const READY = boardFrom(["XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX."]);
const FORMING = boardFrom(["XXXXXXXXX.", "XXXXXXXXX."]);
const RUNS = 1000;

/** How often each kind comes up across many independent selectors. */
function shareOf(board: Board, kind: Kind, runs = RUNS): number {
  let hits = 0;
  for (let seed = 0; seed < runs; seed++) {
    if (nextKind(board, createSelector(seed))[0] === kind) hits++;
  }
  return hits / runs;
}

describe("nextKind", () => {
  it("hands over the I once the well is ready", () => {
    expect(shareOf(READY, "I")).toBeGreaterThanOrEqual(0.8);
  });

  it("holds the I back while the well is still being dug", () => {
    // The wait is the product.
    expect(shareOf(FORMING, "I")).toBeLessThanOrEqual(0.05);
  });

  it("commits when one kind is the clear answer", () => {
    // A T with its nub pointing down drops into the notch in the bottom row and
    // lays its bar across the row above, completing both at once. Every other
    // kind only makes this board worse. Randomness belongs where the decision is
    // close; here, handing over anything else is a fumble rather than variety.
    const obvious = boardFrom([".....X...X", "X...XXXXXX", "XX.XXXXXXX"]);
    expect(shareOf(obvious, "T")).toBeGreaterThan(0.85);
  });

  it("never deals a kind that cannot enter the board", () => {
    // Columns 3 and 6 are walled to the ceiling, 4 and 5 are open, so the O is
    // the only kind that can spawn. Scoring every kind that merely has somewhere
    // to rest would end the game here roughly two draws in three, on a board
    // that is still playable.
    const pillars = boardFrom(Array.from({ length: 22 }, () => "...X..X..."));
    for (let seed = 0; seed < RUNS; seed++) {
      expect(nextKind(pillars, createSelector(seed))[0]).toBe("O");
    }
  });

  it("still yields a kind when the spawn columns are sealed", () => {
    // The rest of the board is wide open, so every kind has resting places and
    // none can reach them. Block out is the right answer, and it must be an
    // answer rather than an empty draw.
    const sealed = boardFrom(Array.from({ length: 22 }, () => "...XXXX..."));
    const [kind, after] = nextKind(sealed, createSelector(9));
    expect(spawnPiece(sealed, kind)).toBeNull();
    expect(after.rng).not.toBe(createSelector(9).rng);
  });

  it("is a pure function of the board and its state", () => {
    const selector = createSelector(4242);
    const once = nextKind(READY, selector);
    for (let i = 0; i < 100; i++) expect(nextKind(READY, selector)).toEqual(once);
  });

  it("never hands over the same kind more than the cap allows", () => {
    let selector = { ...createSelector(1), recent: Array(MAX_REPEAT).fill("I") as Kind[] };
    for (let seed = 0; seed < 200; seed++) {
      selector = { ...selector, rng: seed };
      expect(nextKind(READY, selector)[0]).not.toBe("I");
    }
  });

  it("keeps the board's flattest choices from becoming the only choices", () => {
    // With the seven kinds near-equivalent, the spread floor stops rounding-level
    // differences being rescaled into a near-certain pick.
    const seen = new Set(
      Array.from({ length: RUNS }, (_, seed) => nextKind(boardFrom([]), createSelector(seed))[0]),
    );
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });

  it("nudges a kind that has gone missing", () => {
    // Same board, same seed: the only difference is that S has not been seen.
    const starved = { ...createSelector(7), recent: KINDS.filter((k) => k !== "S") };
    const sated = { ...createSelector(7), recent: [...KINDS] };
    let withNudge = 0;
    let without = 0;
    for (let seed = 0; seed < RUNS; seed++) {
      if (nextKind(FORMING, { ...starved, rng: seed })[0] === "S") withNudge++;
      if (nextKind(FORMING, { ...sated, rng: seed })[0] === "S") without++;
    }
    expect(withNudge).toBeGreaterThan(without);
  });
});

describe("selector state", () => {
  it("remembers what it handed over, newest first and bounded", () => {
    let selector = createSelector(3);
    const dealt: Kind[] = [];
    for (let i = 0; i < STARVE_LIMIT + 5; i++) {
      const [kind, next] = nextKind(boardFrom([]), selector);
      dealt.unshift(kind);
      selector = next;
    }
    expect(selector.recent).toHaveLength(STARVE_LIMIT);
    expect(selector.recent).toEqual(dealt.slice(0, STARVE_LIMIT));
  });

  it("carries the intent forward and ages the dig", () => {
    const [, after] = nextKind(FORMING, createSelector(1));
    expect(after.intent).toBe("tetrisForming");
    expect(after.digAge).toBe(1);
    const [, later] = nextKind(READY, after);
    expect(later.intent).toBe("tetrisReady");
    expect(later.digAge).toBe(0);
  });

  it("still yields a kind when nothing can be placed", () => {
    const full = boardFrom(Array(22).fill("XXXXXXXXXX"));
    const [kind, after] = nextKind(full, createSelector(9));
    expect(KINDS).toContain(kind);
    expect(after.rng).not.toBe(createSelector(9).rng);
  });
});

describe("classic bag", () => {
  it("deals every kind once per shuffle", () => {
    let selector = createSelector(42, true);
    for (let bag = 0; bag < 20; bag++) {
      const kinds: Kind[] = [];
      for (let i = 0; i < 7; i++) {
        const [kind, next] = nextKind(boardFrom([]), selector);
        kinds.push(kind);
        selector = next;
      }
      expect([...kinds].sort()).toEqual([...KINDS].sort());
    }
  });
});

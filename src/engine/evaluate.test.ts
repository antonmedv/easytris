import { describe, expect, it } from "vitest";

import { WEIGHTS } from "./config.ts";
import { evaluate, outcomeOf, scorePlacement } from "./evaluate.ts";
import { placementsOf } from "./placements.ts";
import { boardFrom, bottomRows } from "./testing.ts";
import { KINDS } from "./tetrominoes.ts";
import type { Board, Kind, Weights } from "./types.ts";

/** A well four deep at column 9 with its rows otherwise full: one I from a tetris. */
const READY = boardFrom(["XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX."]);

function bestScore(board: Board, kind: Kind, weights: Weights, wellCol: number | null): number {
  return Math.max(
    ...placementsOf(board, kind).map((piece) => scorePlacement(board, piece, weights, wellCol)),
  );
}

describe("outcomeOf", () => {
  it("reports the rows a placement clears and hands back the board without them", () => {
    const board = boardFrom(["XXXXXXXXX."]);
    const vertical = placementsOf(board, "I").find(
      (piece) => piece.rotation === 1 && piece.col === 7,
    );
    const outcome = outcomeOf(board, vertical!);
    expect(outcome.lines).toBe(1);
    expect(bottomRows(outcome.board, 1)).toEqual([".........I"]);
  });

  it("reports nothing cleared when the placement fills no row", () => {
    expect(outcomeOf(boardFrom([]), placementsOf(boardFrom([]), "O")[0]).lines).toBe(0);
  });
});

describe("evaluate", () => {
  it("makes a single clear worse than no clear while a dig is forming", () => {
    // The centrepiece of the design: mid-dig, a small clear collapses a row the
    // player is assembling, so it has to cost rather than pay.
    const board = boardFrom(["XXXXXXXXX."]);
    expect(evaluate(board, 1, WEIGHTS.tetrisForming, 9)).toBeLessThan(
      evaluate(board, 0, WEIGHTS.tetrisForming, 9),
    );
    expect(evaluate(board, 2, WEIGHTS.tetrisForming, 9)).toBeLessThan(
      evaluate(board, 0, WEIGHTS.tetrisForming, 9),
    );
  });

  it("makes the same clear worth taking when the board needs repair or rescue", () => {
    const board = boardFrom(["XXXXXXXXX."]);
    for (const intent of ["repair", "survive", "build"] as const) {
      expect(evaluate(board, 1, WEIGHTS[intent], 9)).toBeGreaterThan(
        evaluate(board, 0, WEIGHTS[intent], 9),
      );
    }
  });

  it("charges for holes", () => {
    const clean = boardFrom(["XXXXXXXXXX", "XXXXXXXXXX"]);
    const holed = boardFrom(["XXXXXXXXXX", "X.XXXXXXXX"]);
    expect(evaluate(holed, 0, WEIGHTS.build, null)).toBeLessThan(
      evaluate(clean, 0, WEIGHTS.build, null),
    );
  });

  it("pays the bonus while the well is open and withholds it once it is filled", () => {
    const open = boardFrom(["XXXXXXXXX.", "XXXXXXXXX."]);
    const filled = boardFrom(["XXXXXXXXXX", "XXXXXXXXXX"]);
    expect(evaluate(open, 0, WEIGHTS.tetrisForming, 9)).toBe(
      evaluate(open, 0, { ...WEIGHTS.tetrisForming, wellKept: 0 }, 9) + 60,
    );
    expect(evaluate(filled, 0, WEIGHTS.tetrisForming, 9)).toBe(
      evaluate(filled, 0, { ...WEIGHTS.tetrisForming, wellKept: 0 }, 9),
    );
  });

  it("does not charge a deliberate well as bumpiness", () => {
    // Otherwise digging would be permanently expensive and the selector would
    // fight the plan it is meant to be serving.
    const flat: Weights = { ...WEIGHTS.tetrisForming, wellKept: 0 };
    expect(evaluate(READY, 0, flat, 9)).toBeGreaterThan(evaluate(READY, 0, flat, null));
  });
});

describe("scorePlacement", () => {
  it("prefers the I in the well over every other piece once the well is ready", () => {
    const others = KINDS.filter((kind) => kind !== "I");
    const rivals = Math.max(
      ...others.map((kind) => bestScore(READY, kind, WEIGHTS.tetrisReady, 9)),
    );
    expect(bestScore(READY, "I", WEIGHTS.tetrisReady, 9)).toBeGreaterThan(rivals);
  });

  it("refuses to spend the I on a partial clear while the dig is unfinished", () => {
    // Two rows are full but for the well, so an I dropped in would take a double
    // and collapse half the setup. The clear penalties have to make laying it
    // flat the better placement. Holding the piece back altogether is a per-kind
    // judgement the board cannot express, and lives in the selector.
    const forming = boardFrom(["XXXXXXXXX.", "XXXXXXXXX."]);
    const best = placementsOf(forming, "I")
      .map((piece) => ({
        lines: outcomeOf(forming, piece).lines,
        score: scorePlacement(forming, piece, WEIGHTS.tetrisForming, 9),
      }))
      .reduce((left, right) => (right.score > left.score ? right : left));
    expect(best.lines).toBe(0);
  });
});

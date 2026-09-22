import { describe, expect, it } from "vitest";

import { cellsOf, fits } from "./board.ts";
import { ROWS } from "./config.ts";
import { placementsOf } from "./placements.ts";
import { boardFrom } from "./testing.ts";
import { KINDS } from "./tetrominoes.ts";

const EMPTY = boardFrom([]);

describe("placementsOf", () => {
  it("collapses a kind's symmetric rotations", () => {
    // O is the same shape four times over: one placement per column it fits in.
    expect(placementsOf(EMPTY, "O")).toHaveLength(9);
    // I is a bar either way up: 7 horizontal positions plus 10 vertical.
    expect(placementsOf(EMPTY, "I")).toHaveLength(17);
    // S and Z each have two distinct orientations, not four.
    expect(placementsOf(EMPTY, "S")).toHaveLength(17);
    expect(placementsOf(EMPTY, "Z")).toHaveLength(17);
  });

  it("keeps all four orientations for the kinds that have them", () => {
    // T, J and L: two 3-wide orientations at 8 columns, two 2-wide at 9.
    for (const kind of ["T", "J", "L"] as const) {
      expect(placementsOf(EMPTY, kind)).toHaveLength(34);
    }
  });

  it("never returns more than 34 placements for any kind", () => {
    for (const kind of KINDS) expect(placementsOf(EMPTY, kind).length).toBeLessThanOrEqual(34);
  });

  it("rests every placement on the stack or the floor", () => {
    const board = boardFrom(["X........X", "X.XXXXXX.X", "XXXXXXXXXX"]);
    for (const kind of KINDS) {
      for (const piece of placementsOf(board, kind)) {
        expect(fits(board, piece)).toBe(true);
        expect(fits(board, { ...piece, row: piece.row + 1 })).toBe(false);
      }
    }
  });

  it("drops to the floor on an empty board", () => {
    const flat = placementsOf(EMPTY, "O").map((piece) =>
      Math.max(...cellsOf(piece).map((c) => c.row)),
    );
    expect(flat).toEqual(Array(9).fill(ROWS - 1));
  });

  it("cannot reach a cell that needs a tuck under an overhang", () => {
    // Column 0 is open at the bottom but roofed over, so nothing can land there.
    const roofed = boardFrom(["XXXXXXXXXX", "X.........", "X.........", ".XXXXXXXXX"]);
    const landed = placementsOf(roofed, "O").flatMap(cellsOf);
    expect(landed.some((cell) => cell.col === 0 && cell.row === ROWS - 1)).toBe(false);
  });

  it("skips a column whose stack reaches the ceiling", () => {
    const toTheTop = boardFrom(Array(ROWS).fill("XXXXXXXXX."));
    // Only the open column is reachable, and only standing upright.
    const pieces = placementsOf(toTheTop, "I");
    expect(pieces).toHaveLength(1);
    expect(cellsOf(pieces[0]).every((cell) => cell.col === 9)).toBe(true);
  });

  it("returns nothing when the board is full to the ceiling", () => {
    expect(placementsOf(boardFrom(Array(ROWS).fill("XXXXXXXXXX")), "T")).toEqual([]);
  });
});

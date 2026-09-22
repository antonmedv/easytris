import { describe, expect, it } from "vitest";

import { createBoard, fits } from "./board.ts";
import { rotate } from "./srs.ts";
import { boardFrom } from "./testing.ts";
import type { Piece } from "./types.ts";

const empty = createBoard(0).board;

describe("rotate", () => {
  it("rotates in place when there is room, in both directions", () => {
    const t: Piece = { kind: "T", rotation: 0, row: 10, col: 3 };
    expect(rotate(empty, t, 1)).toEqual({ ...t, rotation: 1 });
    expect(rotate(empty, t, -1)).toEqual({ ...t, rotation: 3 });
  });

  it("returns to the start after four clockwise rotations", () => {
    const start: Piece = { kind: "J", rotation: 0, row: 10, col: 3 };
    let piece: Piece | null = start;
    for (let i = 0; i < 4 && piece; i++) piece = rotate(empty, piece, 1);
    expect(piece).toEqual(start);
  });

  it("kicks a vertical T off the left wall when rotating to the flat orientation", () => {
    // Orientation R with the box hanging one column past the wall: cells sit in columns 0 and 1.
    const t: Piece = { kind: "T", rotation: 1, row: 10, col: -1 };
    expect(fits(empty, t)).toBe(true);
    expect(rotate(empty, t, 1)).toEqual({ kind: "T", rotation: 2, row: 10, col: 0 });
  });

  it("kicks a vertical I off the left wall using the I-specific table", () => {
    // Orientation R with the bar in column 0. Only the I table's +2 offset fits.
    const i: Piece = { kind: "I", rotation: 1, row: 10, col: -2 };
    expect(fits(empty, i)).toBe(true);
    expect(rotate(empty, i, -1)).toEqual({ kind: "I", rotation: 0, row: 10, col: 0 });
  });

  it("uses the fifth offset when the first four are blocked (T-spin triple kick)", () => {
    // T in spawn orientation at box (10, 3). Two stack cells block offsets 1-4 for 0 -> L.
    const board = boardFrom([
      ".....X....", // row 10
      "..........", // row 11
      "....X.....", // row 12
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........", // row 21
    ]);
    const t: Piece = { kind: "T", rotation: 0, row: 10, col: 3 };
    expect(fits(board, t)).toBe(true);
    expect(rotate(board, t, -1)).toEqual({ kind: "T", rotation: 3, row: 12, col: 4 });
  });

  it("returns null when no offset fits", () => {
    // Flat I on the floor under three full rows: no vertical placement is possible.
    const board = boardFrom(["XXXXXXXXXX", "XXXXXXXXXX", "XXXXXXXXXX", ".........."]);
    const i: Piece = { kind: "I", rotation: 0, row: 20, col: 3 };
    expect(fits(board, i)).toBe(true);
    expect(rotate(board, i, 1)).toBeNull();
    expect(rotate(board, i, -1)).toBeNull();
  });

  it("never rotates O", () => {
    const o: Piece = { kind: "O", rotation: 0, row: 10, col: 4 };
    expect(rotate(empty, o, 1)).toBeNull();
    expect(rotate(empty, o, -1)).toBeNull();
  });
});

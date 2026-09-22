import { describe, expect, it } from "vitest";

import {
  cellsOf,
  clearRows,
  createBoard,
  dropDistance,
  findFullRows,
  fits,
  place,
  spawnPiece,
} from "./board.ts";
import { BUFFER_ROWS, COLS, ROWS } from "./config.ts";
import { boardFrom, bottomRows, rowStrings } from "./testing.ts";
import { KINDS, SPAWN_COL } from "./tetrominoes.ts";
import type { Board, Kind, Piece } from "./types.ts";

const T_SPAWN: Piece = { kind: "T", rotation: 0, row: 2, col: 3 };

describe("createBoard", () => {
  it("creates an empty board with sequential row ids and the next free id", () => {
    const { board, nextId } = createBoard(0);
    expect(board).toHaveLength(ROWS);
    expect(board.map((row) => row.id)).toEqual(Array.from({ length: ROWS }, (_, i) => i));
    expect(
      board.every((row) => row.cells.length === COLS && row.cells.every((c) => c === null)),
    ).toBe(true);
    expect(nextId).toBe(ROWS);
  });
});

describe("cellsOf", () => {
  it("returns the absolute cells of a piece from its bounding box", () => {
    expect(cellsOf({ kind: "T", rotation: 0, row: 5, col: 3 })).toEqual([
      { row: 5, col: 4 },
      { row: 6, col: 3 },
      { row: 6, col: 4 },
      { row: 6, col: 5 },
    ]);
  });
});

describe("fits", () => {
  const empty = createBoard(0).board;

  it("accepts a piece fully inside an empty board, including the buffer rows", () => {
    expect(fits(empty, T_SPAWN)).toBe(true);
    expect(fits(empty, { ...T_SPAWN, row: 0 })).toBe(true);
  });

  it("rejects cells left of column 0 or right of the last column", () => {
    expect(fits(empty, { ...T_SPAWN, col: -1 })).toBe(false);
    expect(fits(empty, { ...T_SPAWN, col: COLS - 2 })).toBe(false);
  });

  it("rejects cells above the buffer or below the floor", () => {
    expect(fits(empty, { ...T_SPAWN, row: -1 })).toBe(false);
    expect(fits(empty, { ...T_SPAWN, row: ROWS - 1 })).toBe(false);
  });

  it("rejects overlap with the stack but allows touching it", () => {
    const board = boardFrom(["....X....."]);
    const above = { ...T_SPAWN, row: ROWS - 3 }; // cells on rows 19 and 20
    const overlapping = { ...T_SPAWN, row: ROWS - 2 }; // cells on rows 20 and 21
    expect(fits(board, above)).toBe(true);
    expect(fits(board, overlapping)).toBe(false);
  });
});

describe("place", () => {
  it("fills the piece's cells with its kind and keeps untouched rows by reference", () => {
    const before = createBoard(0).board;
    const after = place(before, { kind: "J", rotation: 0, row: ROWS - 2, col: 0 });
    expect(bottomRows(after, 2)).toEqual(["J.........", "JJJ......."]);
    expect(after).toHaveLength(ROWS);
    expect(after[0]).toBe(before[0]);
    expect(after[ROWS - 3]).toBe(before[ROWS - 3]);
    expect(after[ROWS - 1]?.id).toBe(before[ROWS - 1]?.id);
  });
});

describe("findFullRows", () => {
  it("returns the indexes of completely filled rows, top to bottom", () => {
    const board = boardFrom(["XXXXXXXXXX", "XXXX.XXXXX", "XXXXXXXXXX"]);
    expect(findFullRows(board)).toEqual([ROWS - 3, ROWS - 1]);
  });

  it("returns an empty list for a board with no full rows", () => {
    expect(findFullRows(boardFrom(["XXXX.XXXXX"]))).toEqual([]);
  });
});

describe("clearRows", () => {
  it("removes the given rows, shifts survivors down with their ids, and adds fresh rows on top", () => {
    const board = boardFrom(["JJJJJJJJJJ", "JJJJ.JJJJJ", "JJJJJJJJJJ"]);
    const survivorId = board[ROWS - 2]?.id;
    const topId = board[0]?.id;

    const result = clearRows(board, [ROWS - 3, ROWS - 1], ROWS);

    expect(result.board).toHaveLength(ROWS);
    expect(bottomRows(result.board, 2)).toEqual(["..........", "JJJJ.JJJJJ"]);
    expect(result.board[ROWS - 1]?.id).toBe(survivorId);
    expect(result.board[2]?.id).toBe(topId);
    expect(result.board.slice(0, 2).map((row) => row.id)).toEqual([ROWS, ROWS + 1]);
    expect(result.nextId).toBe(ROWS + 2);
    expect(rowStrings(result.board).slice(0, 2)).toEqual(["..........", ".........."]);
  });

  it("does nothing for an empty row list", () => {
    const board = boardFrom(["XXXX.XXXXX"]);
    const result = clearRows(board, [], 22);
    expect(result.board).toBe(board);
    expect(result.nextId).toBe(22);
  });
});

describe("dropDistance", () => {
  it("is the number of free rows below the piece on an empty board", () => {
    const empty = createBoard(0).board;
    // T at row 2 occupies rows 2 and 3; it can fall until its bottom is on row 21.
    expect(dropDistance(empty, T_SPAWN)).toBe(ROWS - 1 - 3);
  });

  it("is 0 for a grounded piece", () => {
    const empty = createBoard(0).board;
    expect(dropDistance(empty, { ...T_SPAWN, row: ROWS - 2 })).toBe(0);
  });

  it("stops above the stack", () => {
    const board = boardFrom(["....X.....", "....X....."]);
    // T at row 2 with cells at columns 3-5; the column-4 stack top is row 20.
    expect(dropDistance(board, T_SPAWN)).toBe(ROWS - 2 - 1 - 3);
  });
});

describe("spawnPiece", () => {
  const topRowOf = (piece: Piece) => Math.min(...cellsOf(piece).map((cell) => cell.row));

  /** The piece, failing with the kind named rather than on a null dereference. */
  function arriving(board: Board, kind: Kind): Piece {
    const piece = spawnPiece(board, kind);
    if (piece === null) throw new Error(`${kind} could not enter the board`);
    return piece;
  }

  it("arrives in rotation 0 with its top cell on the first visible row", () => {
    const empty = createBoard(0).board;
    const arrivals = KINDS.map((kind) => arriving(empty, kind));
    expect(arrivals.map((piece) => piece.rotation)).toEqual(KINDS.map(() => 0));
    expect(arrivals.map((piece) => piece.col)).toEqual(KINDS.map((kind) => SPAWN_COL[kind]));
    expect(arrivals.map(topRowOf)).toEqual(KINDS.map(() => BUFFER_ROWS));
  });

  it("lifts into the buffer when the first visible row is taken", () => {
    const blocked = boardFrom([
      "...XXXX...",
      ...Array.from({ length: ROWS - BUFFER_ROWS - 1 }, () => ".........."),
    ]);
    expect(topRowOf(arriving(blocked, "T"))).toBeLessThan(BUFFER_ROWS);
  });

  it("admits only the kinds whose own spawn columns are still open", () => {
    // Columns 3 and 6 are walled to the ceiling, 4 and 5 are open. The O spawns
    // across 4-5 and gets in; every other kind needs column 3 or 6 and cannot.
    const pillars = boardFrom(Array.from({ length: ROWS }, () => "...X..X..."));
    expect(KINDS.filter((kind) => spawnPiece(pillars, kind) !== null)).toEqual(["O"]);
  });

  it("is null for every kind once the spawn columns are gone", () => {
    const sealed = boardFrom(Array.from({ length: ROWS }, () => "...XXXX..."));
    expect(KINDS.filter((kind) => spawnPiece(sealed, kind) !== null)).toEqual([]);
  });
});

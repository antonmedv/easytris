import { describe, expect, it } from "vitest";

import { BOX_SIZE, KINDS, SHAPES, SPAWN_COL } from "./tetrominoes.ts";
import type { Kind, Orientation } from "./types.ts";

const ORIENTATIONS: readonly Orientation[] = [0, 1, 2, 3];

/** Draws an orientation as rows of "X" and "." so tests read like the SRS diagrams. */
function picture(kind: Kind, orientation: Orientation): string[] {
  const size = BOX_SIZE[kind];
  const rows = Array.from({ length: size }, () => Array.from({ length: size }, () => "."));
  for (const { row, col } of SHAPES[kind][orientation]) {
    rows[row][col] = "X";
  }
  return rows.map((r) => r.join(""));
}

describe("tetromino shapes", () => {
  it("defines four orientations of exactly four cells for all seven kinds", () => {
    expect(KINDS).toEqual(["I", "O", "T", "S", "Z", "J", "L"]);
    for (const kind of KINDS) {
      expect(SHAPES[kind]).toHaveLength(4);
      for (const orientation of ORIENTATIONS) {
        expect(SHAPES[kind][orientation]).toHaveLength(4);
      }
    }
  });

  it("keeps every cell inside the kind's bounding box with no duplicates", () => {
    for (const kind of KINDS) {
      const size = BOX_SIZE[kind];
      for (const orientation of ORIENTATIONS) {
        const seen = new Set<string>();
        for (const { row, col } of SHAPES[kind][orientation]) {
          expect(row).toBeGreaterThanOrEqual(0);
          expect(col).toBeGreaterThanOrEqual(0);
          expect(row).toBeLessThan(size);
          expect(col).toBeLessThan(size);
          seen.add(`${row},${col}`);
        }
        expect(seen.size).toBe(4);
      }
    }
  });

  it("uses a 4x4 box for I, 2x2 for O, and 3x3 for the rest", () => {
    expect(BOX_SIZE).toEqual({ I: 4, O: 2, T: 3, S: 3, Z: 3, J: 3, L: 3 });
  });

  it("spawns every kind in the standard SRS picture", () => {
    expect(picture("I", 0)).toEqual(["....", "XXXX", "....", "...."]);
    expect(picture("O", 0)).toEqual(["XX", "XX"]);
    expect(picture("T", 0)).toEqual([".X.", "XXX", "..."]);
    expect(picture("S", 0)).toEqual([".XX", "XX.", "..."]);
    expect(picture("Z", 0)).toEqual(["XX.", ".XX", "..."]);
    expect(picture("J", 0)).toEqual(["X..", "XXX", "..."]);
    expect(picture("L", 0)).toEqual(["..X", "XXX", "..."]);
  });

  it("rotates T clockwise through the SRS orientations", () => {
    expect(picture("T", 1)).toEqual([".X.", ".XX", ".X."]);
    expect(picture("T", 2)).toEqual(["...", "XXX", ".X."]);
    expect(picture("T", 3)).toEqual([".X.", "XX.", ".X."]);
  });

  it("rotates I between the SRS horizontal and vertical bars", () => {
    expect(picture("I", 1)).toEqual(["..X.", "..X.", "..X.", "..X."]);
    expect(picture("I", 2)).toEqual(["....", "....", "XXXX", "...."]);
    expect(picture("I", 3)).toEqual([".X..", ".X..", ".X..", ".X.."]);
  });

  it("rotates J, L, S and Z clockwise through the SRS orientations", () => {
    expect(picture("J", 1)).toEqual([".XX", ".X.", ".X."]);
    expect(picture("J", 2)).toEqual(["...", "XXX", "..X"]);
    expect(picture("J", 3)).toEqual([".X.", ".X.", "XX."]);
    expect(picture("L", 1)).toEqual([".X.", ".X.", ".XX"]);
    expect(picture("L", 2)).toEqual(["...", "XXX", "X.."]);
    expect(picture("L", 3)).toEqual(["XX.", ".X.", ".X."]);
    expect(picture("S", 1)).toEqual([".X.", ".XX", "..X"]);
    expect(picture("S", 2)).toEqual(["...", ".XX", "XX."]);
    expect(picture("S", 3)).toEqual(["X..", "XX.", ".X."]);
    expect(picture("Z", 1)).toEqual(["..X", ".XX", ".X."]);
    expect(picture("Z", 2)).toEqual(["...", "XX.", ".XX"]);
    expect(picture("Z", 3)).toEqual([".X.", "XX.", "X.."]);
  });
});

describe("spawn columns", () => {
  it("places the bounding box at column 3 for every kind except O at column 4", () => {
    expect(SPAWN_COL).toEqual({ I: 3, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 });
  });
});

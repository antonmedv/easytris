import type { Kind, Orientation, Point } from "./types.ts";

export const KINDS: readonly Kind[] = ["I", "O", "T", "S", "Z", "J", "L"];

/** Side length of each kind's SRS bounding box. */
export const BOX_SIZE: Readonly<Record<Kind, number>> = {
  I: 4,
  O: 2,
  T: 3,
  S: 3,
  Z: 3,
  J: 3,
  L: 3,
};

/** Bounding-box column at spawn so pieces are horizontally centered. */
export const SPAWN_COL: Readonly<Record<Kind, number>> = {
  I: 3,
  O: 4,
  T: 3,
  S: 3,
  Z: 3,
  J: 3,
  L: 3,
};

function shape(...rows: string[]): readonly Point[] {
  const cells: Point[] = [];
  rows.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      if (line[col] === "X") cells.push({ row, col });
    }
  });
  return cells;
}

type Orientations = readonly [
  readonly Point[],
  readonly Point[],
  readonly Point[],
  readonly Point[],
];

/** Cell offsets within the bounding box for each kind and SRS orientation (0, R, 2, L). */
export const SHAPES: Readonly<Record<Kind, Orientations>> = {
  I: [
    shape("....", "XXXX", "....", "...."),
    shape("..X.", "..X.", "..X.", "..X."),
    shape("....", "....", "XXXX", "...."),
    shape(".X..", ".X..", ".X..", ".X.."),
  ],
  O: [shape("XX", "XX"), shape("XX", "XX"), shape("XX", "XX"), shape("XX", "XX")],
  T: [
    shape(".X.", "XXX", "..."),
    shape(".X.", ".XX", ".X."),
    shape("...", "XXX", ".X."),
    shape(".X.", "XX.", ".X."),
  ],
  S: [
    shape(".XX", "XX.", "..."),
    shape(".X.", ".XX", "..X"),
    shape("...", ".XX", "XX."),
    shape("X..", "XX.", ".X."),
  ],
  Z: [
    shape("XX.", ".XX", "..."),
    shape("..X", ".XX", ".X."),
    shape("...", "XX.", ".XX"),
    shape(".X.", "XX.", "X.."),
  ],
  J: [
    shape("X..", "XXX", "..."),
    shape(".XX", ".X.", ".X."),
    shape("...", "XXX", "..X"),
    shape(".X.", ".X.", "XX."),
  ],
  L: [
    shape("..X", "XXX", "..."),
    shape(".X.", ".X.", ".XX"),
    shape("...", "XXX", "X.."),
    shape("XX.", ".X.", ".X."),
  ],
};

export function offsetsOf(kind: Kind, rotation: Orientation): readonly Point[] {
  return SHAPES[kind][rotation];
}

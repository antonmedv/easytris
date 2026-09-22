import { fits } from "./board.ts";
import type { Board, Orientation, Piece, RotationDir } from "./types.ts";

/**
 * SRS wall-kick offsets as (dx, dy) in the usual Tetris convention: x grows
 * right, y grows UP. Board rows grow down, so dy is subtracted from the row.
 */
type Offset = readonly [dx: number, dy: number];
type Kicks = Readonly<Record<"cw" | "ccw", readonly Offset[]>>;
type KickTable = Readonly<Record<Orientation, Kicks>>;

const JLSTZ_KICKS: KickTable = {
  0: {
    cw: [
      [0, 0],
      [-1, 0],
      [-1, 1],
      [0, -2],
      [-1, -2],
    ],
    ccw: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, -2],
      [1, -2],
    ],
  },
  1: {
    cw: [
      [0, 0],
      [1, 0],
      [1, -1],
      [0, 2],
      [1, 2],
    ],
    ccw: [
      [0, 0],
      [1, 0],
      [1, -1],
      [0, 2],
      [1, 2],
    ],
  },
  2: {
    cw: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, -2],
      [1, -2],
    ],
    ccw: [
      [0, 0],
      [-1, 0],
      [-1, 1],
      [0, -2],
      [-1, -2],
    ],
  },
  3: {
    cw: [
      [0, 0],
      [-1, 0],
      [-1, -1],
      [0, 2],
      [-1, 2],
    ],
    ccw: [
      [0, 0],
      [-1, 0],
      [-1, -1],
      [0, 2],
      [-1, 2],
    ],
  },
};

const I_KICKS: KickTable = {
  0: {
    cw: [
      [0, 0],
      [-2, 0],
      [1, 0],
      [-2, -1],
      [1, 2],
    ],
    ccw: [
      [0, 0],
      [-1, 0],
      [2, 0],
      [-1, 2],
      [2, -1],
    ],
  },
  1: {
    cw: [
      [0, 0],
      [-1, 0],
      [2, 0],
      [-1, 2],
      [2, -1],
    ],
    ccw: [
      [0, 0],
      [2, 0],
      [-1, 0],
      [2, 1],
      [-1, -2],
    ],
  },
  2: {
    cw: [
      [0, 0],
      [2, 0],
      [-1, 0],
      [2, 1],
      [-1, -2],
    ],
    ccw: [
      [0, 0],
      [1, 0],
      [-2, 0],
      [1, -2],
      [-2, 1],
    ],
  },
  3: {
    cw: [
      [0, 0],
      [1, 0],
      [-2, 0],
      [1, -2],
      [-2, 1],
    ],
    ccw: [
      [0, 0],
      [-2, 0],
      [1, 0],
      [-2, -1],
      [1, 2],
    ],
  },
};

function nextOrientation(rotation: Orientation, dir: RotationDir): Orientation {
  return ((((rotation + dir) % 4) + 4) % 4) as Orientation;
}

export function rotate(board: Board, piece: Piece, dir: RotationDir): Piece | null {
  if (piece.kind === "O") return null;
  const to = nextOrientation(piece.rotation, dir);
  const table = piece.kind === "I" ? I_KICKS : JLSTZ_KICKS;
  for (const [dx, dy] of table[piece.rotation][dir === 1 ? "cw" : "ccw"]) {
    const candidate: Piece = { ...piece, rotation: to, row: piece.row - dy, col: piece.col + dx };
    if (fits(board, candidate)) return candidate;
  }
  return null;
}

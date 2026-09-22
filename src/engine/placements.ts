import { cellsOf, dropDistance, fits } from "./board.ts";
import { COLS } from "./config.ts";
import { offsetsOf } from "./tetrominoes.ts";
import type { Board, Kind, Orientation, Piece } from "./types.ts";

const ROTATIONS: readonly Orientation[] = [0, 1, 2, 3];

/** A placement's identity is the cells it fills, so symmetric rotations collapse. */
function cellKey(piece: Piece): string {
  return cellsOf(piece)
    .map((cell) => `${cell.row},${cell.col}`)
    .sort()
    .join(" ");
}

/**
 * Every resting place the player can reach with a straight hard drop.
 *
 * Tucks, kicks and spins are excluded deliberately. Board.tsx draws the ghost
 * piece at exactly the hard-drop landing cell, so the selector's model of where
 * a piece can go is the model the player is looking at. A placement that needs
 * a T-spin is not help.
 */
export function placementsOf(board: Board, kind: Kind): Piece[] {
  const placements: Piece[] = [];
  const seen = new Set<string>();
  for (const rotation of ROTATIONS) {
    const offsets = offsetsOf(kind, rotation);
    const rows = offsets.map((offset) => offset.row);
    const cols = offsets.map((offset) => offset.col);
    // Enter with the topmost cell on row 0 and every cell inside the walls.
    const row = -Math.min(...rows);
    const first = -Math.min(...cols);
    const last = COLS - 1 - Math.max(...cols);
    for (let col = first; col <= last; col++) {
      const entry: Piece = { kind, rotation, row, col };
      // A blocked entry means the stack reaches the ceiling in this column.
      if (!fits(board, entry)) continue;
      const rested: Piece = { ...entry, row: row + dropDistance(board, entry) };
      const key = cellKey(rested);
      if (seen.has(key)) continue;
      seen.add(key);
      placements.push(rested);
    }
  }
  return placements;
}

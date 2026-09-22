import { clearRows, findFullRows, place } from "./board.ts";
import { COLS, WELL_MIN_DEPTH } from "./config.ts";
import { surfaceOf } from "./surface.ts";
import type { Board, Piece, Weights } from "./types.ts";

/**
 * Bumpiness with the well's own walls left out.
 *
 * A deliberate well is two large steps in the surface. Counting them would make
 * digging permanently expensive and would swamp the bonus for keeping the well
 * open, so the selector would fight the player's plan instead of serving it.
 */
function bumpinessAround(heights: readonly number[], wellCol: number | null): number {
  let total = 0;
  for (let col = 0; col < COLS - 1; col++) {
    if (col === wellCol || col + 1 === wellCol) continue;
    total += Math.abs(heights[col] - heights[col + 1]);
  }
  return total;
}

export function outcomeOf(board: Board, piece: Piece): { board: Board; lines: number } {
  const placed = place(board, piece);
  const full = findFullRows(placed);
  if (full.length === 0) return { board: placed, lines: 0 };
  return { board: clearRows(placed, full, 0).board, lines: full.length };
}

/**
 * Holes are the resulting board's total, not a count of newly created ones. The
 * two diverge when a placement clears a row that was capping a hole, and
 * total-after is the number that describes how stuck the player is.
 */
export function evaluate(
  board: Board,
  lines: number,
  weights: Weights,
  wellCol: number | null,
): number {
  const surface = surfaceOf(board);
  const kept =
    wellCol !== null && surface.wellDepths[wellCol] >= WELL_MIN_DEPTH ? weights.wellKept : 0;
  return (
    weights.clear[lines] +
    weights.holes * surface.totalHoles +
    weights.bumpiness * bumpinessAround(surface.heights, wellCol) +
    weights.aggregateHeight * surface.aggregateHeight +
    weights.maxHeight * surface.maxHeight +
    kept
  );
}

export function scorePlacement(
  board: Board,
  piece: Piece,
  weights: Weights,
  wellCol: number | null,
): number {
  const outcome = outcomeOf(board, piece);
  return evaluate(outcome.board, outcome.lines, weights, wellCol);
}

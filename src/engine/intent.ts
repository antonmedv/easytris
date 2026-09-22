import {
  COLS,
  CRITICAL_HEIGHT,
  DANGER_COLUMNS,
  DANGER_EXIT,
  DANGER_HEIGHT,
  DIG_HOLE_TOLERANCE,
  DIG_PATIENCE,
  REPAIR_HOLES,
  ROUGH_THRESHOLD,
  ROWS,
  TETRIS_WELL_DEPTH,
  WELL_LEAD,
  WELL_MIN_DEPTH,
} from "./config.ts";
import { columnsAtOrAbove, surfaceOf, type Surface } from "./surface.ts";
import type { Board, Intent } from "./types.ts";

export type Reading = {
  readonly intent: Intent;
  readonly wellCol: number | null;
};

/**
 * The one column the player is digging, or null.
 *
 * Two comparable depressions are a jagged surface, not a plan, so the deepest
 * column wins only when it leads by WELL_LEAD; a real rival puts the reading
 * back to null.
 *
 * A column with holes beneath it is not a dig either, however deep the shaft
 * above looks. An I dropped in lands on the lid and the dead rows underneath
 * stay dead, so the tetris it appears to promise can never arrive -- and reading
 * it as a dig withholds the I and penalises the clears that were the only way
 * back out.
 */
function wellColumnOf(surface: Surface): number | null {
  const candidates: number[] = [];
  for (let col = 0; col < COLS; col++) {
    if (surface.wellDepths[col] < WELL_MIN_DEPTH || surface.holes[col] > 0) continue;
    candidates.push(col);
  }
  if (candidates.length === 0) return null;
  candidates.sort((left, right) => surface.wellDepths[right] - surface.wellDepths[left]);
  const [deepest, rival] = candidates;
  if (rival === undefined) return deepest;
  return surface.wellDepths[deepest] - surface.wellDepths[rival] >= WELL_LEAD ? deepest : null;
}

/**
 * Whether an I dropped into the well would clear four rows.
 *
 * The rows that matter are the four the piece would actually fill: the lowest
 * open ones, counting up from the well's floor. A deeper well whose upper rows
 * are complete but whose floor is not is not ready -- the I would land at the
 * bottom and clear nothing.
 */
function isTetrisReady(board: Board, surface: Surface, wellCol: number): boolean {
  if (surface.wellDepths[wellCol] < TETRIS_WELL_DEPTH) return false;
  const floor = ROWS - surface.heights[wellCol] - 1;
  for (let row = floor; row > floor - TETRIS_WELL_DEPTH; row--) {
    if (row < 0) return false;
    if (!board[row].cells.every((cell, col) => col === wellCol || cell !== null)) return false;
  }
  return true;
}

/**
 * Not memoryless, deliberately. Danger entered and left on one threshold would
 * flip the intent on alternating spawns as the stack hovers at it, and an
 * unbounded dig would let a forgotten well starve the player of clears forever.
 */
export function readBoard(board: Board, prior: Intent, digAge: number): Reading {
  const surface = surfaceOf(board);
  const wellCol = wellColumnOf(surface);

  // Danger holds until the stack is properly clear, not the moment it dips
  // below the trigger.
  const entering =
    surface.maxHeight >= CRITICAL_HEIGHT ||
    columnsAtOrAbove(surface, DANGER_HEIGHT) >= DANGER_COLUMNS;
  const holding = prior === "survive" && surface.maxHeight >= DANGER_EXIT;
  if (entering || holding) return { intent: "survive", wellCol };

  if (wellCol !== null) {
    if (isTetrisReady(board, surface, wellCol)) return { intent: "tetrisReady", wellCol };
    // No upper bound on depth: a well past four rows whose lines are not yet
    // complete is still a dig, and dropping through to repair or build would
    // start rewarding the very clears that take it apart.
    if (digAge < DIG_PATIENCE && surface.totalHoles <= DIG_HOLE_TOLERANCE) {
      return { intent: "tetrisForming", wellCol };
    }
  }

  if (surface.totalHoles >= REPAIR_HOLES || surface.bumpiness > ROUGH_THRESHOLD) {
    return { intent: "repair", wellCol };
  }
  return { intent: "build", wellCol };
}

/**
 * Ages the well the board is carrying, and forgets one that has gone.
 *
 * The clock runs per well, not per stretch of digging: a well gets one budget,
 * spent whether or not the player is using it, and only a well that disappears
 * or pays out earns another. Counting `tetrisForming` spawns instead would let
 * the spawn that gives up on a dig reset the budget that had just expired, and
 * DIG_PATIENCE would never abandon anything. A dig interrupted by a spell of
 * repair is still the same dig, and still ageing.
 */
export function nextDigAge(reading: Reading, digAge: number): number {
  if (reading.wellCol === null || reading.intent === "tetrisReady") return 0;
  return digAge + 1;
}

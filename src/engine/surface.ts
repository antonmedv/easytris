import { COLS, ROWS } from "./config.ts";
import type { Board } from "./types.ts";

/** One pass of readings over the stack, taken together rather than one at a time. */
export type Surface = {
  /** Rows from the floor up to the topmost filled cell; 0 for an empty column. */
  readonly heights: readonly number[];
  /** Empty cells trapped beneath a column's topmost filled cell. */
  readonly holes: readonly number[];
  readonly totalHoles: number;
  /** Sum of the steps between neighbouring columns. Flat stacks read 0. */
  readonly bumpiness: number;
  readonly wellDepths: readonly number[];
  readonly maxHeight: number;
  readonly aggregateHeight: number;
};

function columnHeights(board: Board): number[] {
  const heights: number[] = [];
  for (let col = 0; col < COLS; col++) {
    let height = 0;
    for (let row = 0; row < ROWS; row++) {
      if (board[row].cells[col] !== null) {
        height = ROWS - row;
        break;
      }
    }
    heights.push(height);
  }
  return heights;
}

function columnHoles(board: Board, heights: readonly number[]): number[] {
  return heights.map((height, col) => {
    let holes = 0;
    for (let row = ROWS - height + 1; row < ROWS; row++) {
      if (board[row].cells[col] === null) holes++;
    }
    return holes;
  });
}

/**
 * A missing neighbour past the wall counts as infinitely high, so an edge column
 * reads as a well when it is one -- which is exactly where players dig.
 */
export function wellDepths(heights: readonly number[]): number[] {
  return heights.map((height, col) => {
    const left = col === 0 ? Infinity : heights[col - 1];
    const right = col === COLS - 1 ? Infinity : heights[col + 1];
    return Math.max(0, Math.min(left, right) - height);
  });
}

export function surfaceOf(board: Board): Surface {
  const heights = columnHeights(board);
  const holes = columnHoles(board, heights);
  let bumpiness = 0;
  for (let col = 0; col < COLS - 1; col++) bumpiness += Math.abs(heights[col] - heights[col + 1]);
  return {
    heights,
    holes,
    totalHoles: holes.reduce((sum, count) => sum + count, 0),
    bumpiness,
    wellDepths: wellDepths(heights),
    maxHeight: Math.max(...heights),
    aggregateHeight: heights.reduce((sum, height) => sum + height, 0),
  };
}

/** Danger is a broad stack, not one spike, so survival counts columns. */
export function columnsAtOrAbove(surface: Surface, height: number): number {
  return surface.heights.filter((column) => column >= height).length;
}

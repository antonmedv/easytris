import { BUFFER_ROWS, COLS, ROWS } from "./config.ts";
import { offsetsOf, SPAWN_COL } from "./tetrominoes.ts";
import type { Board, Cell, Kind, Piece, Point, Row } from "./types.ts";

function emptyCells(): Cell[] {
  return Array.from({ length: COLS }, (): Cell => null);
}

export function createBoard(nextId: number): { board: Board; nextId: number } {
  const board: Row[] = [];
  for (let i = 0; i < ROWS; i++) {
    board.push({ id: nextId + i, cells: emptyCells() });
  }
  return { board, nextId: nextId + ROWS };
}

export function cellsOf(piece: Piece): Point[] {
  return offsetsOf(piece.kind, piece.rotation).map((offset) => ({
    row: piece.row + offset.row,
    col: piece.col + offset.col,
  }));
}

export function fits(board: Board, piece: Piece): boolean {
  for (const { row, col } of cellsOf(piece)) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
    if (board[row].cells[col] !== null) return false;
  }
  return true;
}

/** Untouched rows keep their identity, so the UI can tell what moved. */
export function place(board: Board, piece: Piece): Board {
  const next = [...board];
  for (const { row, col } of cellsOf(piece)) {
    const current = next[row];
    // Copy a row the first time this call touches it, then keep writing into
    // that copy: once next[row] differs from board[row] the array is one this
    // call made and nobody else can see, so mutating it is safe.
    const cells = current === board[row] ? [...current.cells] : (current.cells as Cell[]);
    cells[col] = piece.kind;
    next[row] = { id: current.id, cells };
  }
  return next;
}

export function findFullRows(board: Board): number[] {
  const full: number[] = [];
  board.forEach((row, index) => {
    if (row.cells.every((cell) => cell !== null)) full.push(index);
  });
  return full;
}

/** Surviving rows keep their ids; new rows take ids from `nextId`. */
export function clearRows(
  board: Board,
  rowIndexes: readonly number[],
  nextId: number,
): { board: Board; nextId: number } {
  if (rowIndexes.length === 0) return { board, nextId };
  const removed = new Set(rowIndexes);
  const survivors = board.filter((_, index) => !removed.has(index));
  const fresh: Row[] = [];
  for (let i = 0; i < rowIndexes.length; i++) {
    fresh.push({ id: nextId + i, cells: emptyCells() });
  }
  return { board: [...fresh, ...survivors], nextId: nextId + rowIndexes.length };
}

/**
 * Where a kind would arrive, or null when it cannot enter the board at all.
 *
 * Shared with the selector rather than kept in the reducer: a kind that cannot
 * enter is not a choice, and dealing it while another kind would have fitted
 * ends the game for no reason.
 */
export function spawnPiece(board: Board, kind: Kind): Piece | null {
  const topOffset = Math.min(...offsetsOf(kind, 0).map((offset) => offset.row));
  const row = BUFFER_ROWS - topOffset;
  for (let lift = 0; lift <= BUFFER_ROWS; lift++) {
    const piece: Piece = { kind, rotation: 0, row: row - lift, col: SPAWN_COL[kind] };
    if (fits(board, piece)) return piece;
  }
  return null;
}

export function dropDistance(board: Board, piece: Piece): number {
  let distance = 0;
  while (fits(board, { ...piece, row: piece.row + distance + 1 })) distance++;
  return distance;
}

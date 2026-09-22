import { spawnPiece } from "./board.ts";
import { CLEAR_ANIMATION_MS, COLS, ROWS, WEIGHTS } from "./config.ts";
import { scorePlacement } from "./evaluate.ts";
import { createGame, reduce } from "./game.ts";
import { readBoard } from "./intent.ts";
import { placementsOf } from "./placements.ts";
import { nextRandom } from "./rng.ts";
import { createSelector, nextKind } from "./selector.ts";
import { KINDS } from "./tetrominoes.ts";
import type { Board, Cell, GameState, Intent, Kind, Piece, Row } from "./types.ts";

const KIND_LETTERS = new Set(["I", "O", "T", "S", "Z", "J", "L"]);

/** Kind used for a generic "X" cell in ASCII boards. */
export const GENERIC_KIND: Kind = "T";

function cellFromChar(char: string): Cell {
  if (char === ".") return null;
  if (char === "X") return GENERIC_KIND;
  if (KIND_LETTERS.has(char)) return char as Kind;
  throw new Error(`Unknown board character "${char}"`);
}

/**
 * Builds a full board from the bottom rows of an ASCII picture.
 * "." is empty, "X" is a generic filled cell, a kind letter is that kind.
 * Rows above the picture are empty. Row ids run 0..ROWS-1 from the top.
 */
export function boardFrom(picture: readonly string[]): Board {
  if (picture.length > ROWS) throw new Error(`At most ${ROWS} rows allowed`);
  const rows: Row[] = [];
  const emptyCount = ROWS - picture.length;
  for (let id = 0; id < emptyCount; id++) {
    rows.push({ id, cells: Array.from({ length: COLS }, (): Cell => null) });
  }
  picture.forEach((line, index) => {
    if (line.length !== COLS) throw new Error(`Row "${line}" must have ${COLS} characters`);
    rows.push({ id: emptyCount + index, cells: [...line].map(cellFromChar) });
  });
  return rows;
}

export function rowStrings(board: Board): string[] {
  return board.map((row) => row.cells.map((cell) => cell ?? ".").join(""));
}

export function bottomRows(board: Board, count: number): string[] {
  return rowStrings(board).slice(-count);
}

// Game-state helpers -------------------------------------------------------------

/**
 * A seed whose first piece is the given kind, so tests can pick their piece.
 *
 * The first piece is not a property of the seed alone -- it is whatever the
 * selector chooses for an empty board -- so this searches against the real
 * selector. The range is wide because a kind the opening board has little use
 * for, S or Z, turns up in well under one seed in a hundred.
 */
export function seedFor(kind: Kind): number {
  const opening = boardFrom([]);
  for (let seed = 0; seed < 20000; seed++) {
    if (nextKind(opening, createSelector(seed))[0] === kind) return seed;
  }
  throw new Error(`No seed under 20000 starts with ${kind}`);
}

export function startGame(seed: number): GameState {
  return reduce(createGame(seed), { type: "start" });
}

export function withBoard(state: GameState, board: Board): GameState {
  return { ...state, board };
}

/** Replaces the active piece and resets its timers, as if it had just arrived there. */
export function withActive(state: GameState, piece: Piece): GameState {
  return {
    ...state,
    active: piece,
    gravityAcc: 0,
    lockTimer: 0,
    lockResets: 0,
    lowestRow: piece.row,
  };
}

/** A playing game whose T piece rests flat on the empty floor. */
export function groundedPiece(seed = 1): GameState {
  return withActive(startGame(seed), { kind: "T", rotation: 0, row: ROWS - 2, col: 3 });
}

export function countFilled(board: Board): number {
  return board.reduce((sum, row) => sum + row.cells.filter((cell) => cell !== null).length, 0);
}

export function activeOf(state: GameState): Piece {
  if (state.active === null) throw new Error(`No active piece in phase "${state.phase}"`);
  return state.active;
}

// Bot harness --------------------------------------------------------------------

/**
 * How well the bot places what it is given. "betterHalf" models the player this
 * feature exists for: someone who picks a reasonable spot rather than the best
 * one. "worst" is deliberate bad play, for proving the game can still be lost.
 */
export type BotSkill = "best" | "betterHalf" | "fallible" | "worst";

export type BotOptions = {
  readonly classic?: boolean;
  readonly skill?: BotSkill;
  readonly maxPieces?: number;
};

export type BotResult = {
  readonly lines: number;
  readonly pieces: number;
  readonly toppedOut: boolean;
  readonly kinds: readonly Kind[];
  readonly intents: readonly Intent[];
  /**
   * Which kinds could have entered the board at each spawn, in step with
   * `kinds`. Near the ceiling the board itself rules kinds out, and a kind the
   * board refused was not one the selector withheld -- telling those apart is
   * what makes the variety measurements mean anything.
   */
  readonly admitted: readonly (readonly Kind[])[];
};

/** Which ranked placement a skill level reaches for, given a roll in [0, 1). */
function rankFor(skill: BotSkill, count: number, roll: number): number {
  if (skill === "best") return 0;
  if (skill === "worst") return count - 1;
  const half = Math.ceil(count / 2);
  if (skill === "betterHalf") return Math.min(half - 1, Math.floor(roll * half));
  // Fallible: usually right, occasionally careless. The player this is for.
  return roll < 0.75 ? 0 : Math.min(half - 1, 1 + Math.floor(((roll - 0.75) / 0.25) * (half - 1)));
}

/**
 * Plays a whole game, choosing where each piece goes but never which piece.
 *
 * The bot reads the board itself rather than borrowing the selector's judgement,
 * so it plays identically whichever way pieces are supplied and the comparison
 * isolates the supply. It is imperfect on purpose: a bot sharing the selector's
 * optimum always finds the best placement, which measures the feature on the
 * player who needs it least.
 */
export function playGame(seed: number, options: BotOptions = {}): BotResult {
  const { classic = false, skill = "betterHalf", maxPieces = 300 } = options;
  const fresh = createGame(seed);
  let state = reduce({ ...fresh, selector: createSelector(seed, classic) }, { type: "start" });
  let rng = (seed * 2654435761) >>> 0;
  const kinds: Kind[] = [];
  const intents: Intent[] = [];
  const admitted: Kind[][] = [];

  while (state.phase !== "over" && state.pieceCount <= maxPieces) {
    if (state.phase === "clearing") {
      state = reduce(state, { type: "tick", dtMs: CLEAR_ANIMATION_MS });
      continue;
    }
    const active = state.active;
    if (active === null) break;
    kinds.push(active.kind);
    intents.push(state.selector.intent);
    // The active piece is not on the board until it locks, so this is the board
    // the selector was looking at when it dealt that piece.
    admitted.push(KINDS.filter((kind) => spawnPiece(state.board, kind) !== null));

    const { intent, wellCol } = readBoard(state.board, "build", 0);
    const ranked = placementsOf(state.board, active.kind)
      .map((piece) => ({
        piece,
        score: scorePlacement(state.board, piece, WEIGHTS[intent], wellCol),
      }))
      .sort((left, right) => right.score - left.score);
    if (ranked.length === 0) break;

    const [roll, next] = nextRandom(rng);
    rng = next;
    const chosen = ranked[rankFor(skill, ranked.length, roll)].piece;
    state = reduce({ ...state, active: chosen }, { type: "hardDrop" });
  }

  return {
    lines: state.linesCleared,
    pieces: state.pieceCount,
    toppedOut: state.phase === "over",
    kinds,
    intents,
    admitted,
  };
}

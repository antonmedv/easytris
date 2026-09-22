import { assertNever } from "./assert.ts";
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
import {
  BUFFER_ROWS,
  CLEAR_ANIMATION_MS,
  LOCK_DELAY_MS,
  LOCK_RESET_LIMIT,
  SOFT_DROP_MS,
} from "./config.ts";
import { gravityMs, levelOf } from "./gravity.ts";
import { nextRandom } from "./rng.ts";
import { createSelector, nextKind } from "./selector.ts";
import { rotate } from "./srs.ts";
import type { Action, Board, GameEvent, GameState, Piece, RotationDir } from "./types.ts";

/** Shared empty event list so "nothing happened" is a reference check. */
export const NO_EVENTS: readonly GameEvent[] = Object.freeze([]);

export function createGame(seed: number, classic?: boolean): GameState {
  const { board, nextId } = createBoard(0);
  return {
    phase: "ready",
    resumePhase: "playing",
    board,
    active: null,
    selector: createSelector(seed, classic),
    nextRowId: nextId,
    gravityAcc: 0,
    lockTimer: 0,
    lockResets: 0,
    lowestRow: 0,
    softDropping: false,
    clearing: null,
    linesCleared: 0,
    pieceCount: 0,
    events: NO_EVENTS,
  };
}

/** Time arrives as a tick action, so every step is deterministic. */
export function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "start":
      return state.phase === "ready" ? spawn({ ...state, phase: "playing" }, []) : quiet(state);
    case "tick":
      return tick(state, action.dtMs);
    case "shift":
      return shift(state, action.dx);
    case "rotate":
      return rotateActive(state, action.dir);
    case "softDrop":
      return { ...quiet(state), softDropping: action.on };
    case "dropStep":
      return dropStep(state);
    case "hardDrop":
      return hardDrop(state);
    case "pause":
      return pause(state);
    case "resume":
      return state.phase === "paused"
        ? { ...quiet(state), phase: state.resumePhase }
        : quiet(state);
    case "restart":
      return spawn(
        {
          // The supply is a preference, not part of the game being thrown away.
          ...createGame(action.seed ?? nextRandom(state.selector.rng)[1], state.selector.classic),
          phase: "playing",
        },
        [],
      );
    case "setClassic":
      return setClassic(state, action.on);
    default:
      return assertNever(action);
  }
}

/**
 * Switches the supply the next spawn draws from. Mid-game is the point: the
 * selector reads nothing that the classic bag writes and writes nothing it
 * reads, so the two can be swapped between any two pieces, and feeling the
 * difference under one board is the only way to see there is one.
 */
function setClassic(state: GameState, on: boolean): GameState {
  if (state.selector.classic === on) return quiet(state);
  return { ...quiet(state), selector: { ...state.selector, classic: on } };
}

function pause(state: GameState): GameState {
  if (state.phase !== "playing" && state.phase !== "clearing") return quiet(state);
  return { ...quiet(state), phase: "paused", resumePhase: state.phase };
}

// Helpers ----------------------------------------------------------------------

/** The same state with events cleared. Keeps the reference when already clear. */
function quiet(state: GameState): GameState {
  return state.events === NO_EVENTS ? state : { ...state, events: NO_EVENTS };
}

function finish(state: GameState, events: GameEvent[]): GameState {
  return { ...state, events: events.length > 0 ? events : NO_EVENTS };
}

function isGrounded(board: Board, piece: Piece): boolean {
  return !fits(board, { ...piece, row: piece.row + 1 });
}

/** Draws and places the next piece. Failure is a block out. */
function spawn(state: GameState, events: GameEvent[]): GameState {
  const [kind, selector] = nextKind(state.board, state.selector);
  const piece = spawnPiece(state.board, kind);
  if (piece === null) {
    events.push({ type: "gameOver" });
    return finish({ ...state, selector, active: null, phase: "over" }, events);
  }
  events.push({ type: "spawn" });
  return finish(
    {
      ...state,
      selector,
      active: piece,
      gravityAcc: 0,
      lockTimer: 0,
      lockResets: 0,
      lowestRow: piece.row,
      pieceCount: state.pieceCount + 1,
    },
    events,
  );
}

function lock(state: GameState, piece: Piece, events: GameEvent[]): GameState {
  const cells = cellsOf(piece);
  const board = place(state.board, piece);
  events.push({ type: "lock", cells });
  if (cells.every((cell) => cell.row < BUFFER_ROWS)) {
    events.push({ type: "gameOver" });
    return finish({ ...state, board, active: null, phase: "over" }, events);
  }
  const fullRows = findFullRows(board);
  if (fullRows.length > 0) {
    events.push({ type: "clear", rows: fullRows });
    return finish(
      {
        ...state,
        board,
        active: null,
        phase: "clearing",
        clearing: { rows: fullRows, elapsed: 0 },
      },
      events,
    );
  }
  return spawn({ ...state, board, active: null }, events);
}

function tickClearing(state: GameState, dtMs: number): GameState {
  if (state.clearing === null) return quiet(state);
  const elapsed = state.clearing.elapsed + dtMs;
  if (elapsed < CLEAR_ANIMATION_MS) {
    return { ...state, clearing: { rows: state.clearing.rows, elapsed }, events: NO_EVENTS };
  }
  const { board, nextId } = clearRows(state.board, state.clearing.rows, state.nextRowId);
  const linesCleared = state.linesCleared + state.clearing.rows.length;
  const events: GameEvent[] = [];
  const level = levelOf(linesCleared);
  if (level > levelOf(state.linesCleared)) events.push({ type: "levelUp", level });
  return spawn(
    { ...state, board, nextRowId: nextId, linesCleared, clearing: null, phase: "playing" },
    events,
  );
}

function movable(state: GameState): Piece | null {
  return state.phase === "playing" ? state.active : null;
}

/**
 * Applies a successful shift or rotation. While grounded, the move restarts
 * the lock delay until the reset budget for this row is spent.
 */
function moveActive(state: GameState, from: Piece, to: Piece, event: GameEvent): GameState {
  const resets =
    isGrounded(state.board, from) && state.lockResets < LOCK_RESET_LIMIT
      ? { lockTimer: 0, lockResets: state.lockResets + 1 }
      : {};
  const moved = { ...state, active: to, ...resets };
  return finish({ ...moved, ...lowestRowUpdate(moved, to) }, [event]);
}

function shift(state: GameState, dx: -1 | 1): GameState {
  const active = movable(state);
  if (active === null) return quiet(state);
  const candidate = { ...active, col: active.col + dx };
  if (!fits(state.board, candidate)) return quiet(state);
  return moveActive(state, active, candidate, { type: "shift" });
}

function rotateActive(state: GameState, dir: RotationDir): GameState {
  const active = movable(state);
  if (active === null) return quiet(state);
  const candidate = rotate(state.board, active, dir);
  if (candidate === null) return quiet(state);
  return moveActive(state, active, candidate, { type: "rotate" });
}

function dropStep(state: GameState): GameState {
  const active = movable(state);
  if (active === null) return quiet(state);
  const candidate = { ...active, row: active.row + 1 };
  if (!fits(state.board, candidate)) return quiet(state);
  const moved = { ...state, active: candidate, gravityAcc: 0, lockTimer: 0 };
  return finish({ ...moved, ...lowestRowUpdate(moved, candidate) }, []);
}

function hardDrop(state: GameState): GameState {
  const active = movable(state);
  if (active === null) return quiet(state);
  const distance = dropDistance(state.board, active);
  const dropped = { ...active, row: active.row + distance };
  return lock(state, dropped, [{ type: "hardDrop", distance }]);
}

function tick(state: GameState, dtMs: number): GameState {
  if (state.phase === "clearing") return tickClearing(state, dtMs);
  if (state.phase !== "playing" || state.active === null) return quiet(state);
  const { board, active } = state;

  if (isGrounded(board, active)) {
    const lockTimer = state.lockTimer + dtMs;
    if (lockTimer < LOCK_DELAY_MS) {
      return { ...state, lockTimer, gravityAcc: 0, events: NO_EVENTS };
    }
    return lock(state, active, []);
  }

  const interval = state.softDropping ? SOFT_DROP_MS : gravityMs(levelOf(state.linesCleared));
  let gravityAcc = state.gravityAcc + dtMs;
  let piece = active;
  while (gravityAcc >= interval) {
    gravityAcc -= interval;
    piece = { ...piece, row: piece.row + 1 };
    if (isGrounded(board, piece)) {
      gravityAcc = 0;
      break;
    }
  }
  return {
    ...state,
    active: piece,
    gravityAcc,
    lockTimer: 0,
    ...lowestRowUpdate(state, piece),
    events: NO_EVENTS,
  };
}

/** Reaching a new lowest row re-arms the lock-delay reset budget. */
function lowestRowUpdate(
  state: GameState,
  piece: Piece,
): Pick<GameState, "lowestRow" | "lockResets"> {
  if (piece.row > state.lowestRow) return { lowestRow: piece.row, lockResets: 0 };
  return { lowestRow: state.lowestRow, lockResets: state.lockResets };
}

export type Kind = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

export type Cell = Kind | null;

/**
 * A board row. The id is stable for the row's lifetime so the UI can key rows
 * and animate them sliding down after a line clear.
 */
export type Row = {
  readonly id: number;
  readonly cells: readonly Cell[];
};

/** Row 0 is the top buffer row; the last VISIBLE_ROWS rows are shown. */
export type Board = readonly Row[];

/** SRS orientations: 0 = spawn, 1 = clockwise (R), 2 = 180, 3 = counter-clockwise (L). */
export type Orientation = 0 | 1 | 2 | 3;

/** Rows grow downward, columns grow to the right. */
export type Point = {
  readonly row: number;
  readonly col: number;
};

/** `row` and `col` are the bounding box's top-left corner, not a filled cell. */
export type Piece = {
  readonly kind: Kind;
  readonly rotation: Orientation;
  readonly row: number;
  readonly col: number;
};

export type RotationDir = 1 | -1;

export type Phase = "ready" | "playing" | "clearing" | "paused" | "over";

export type Action =
  | { readonly type: "start" }
  | { readonly type: "tick"; readonly dtMs: number }
  | { readonly type: "shift"; readonly dx: -1 | 1 }
  | { readonly type: "rotate"; readonly dir: RotationDir }
  | { readonly type: "softDrop"; readonly on: boolean }
  | { readonly type: "dropStep" }
  | { readonly type: "hardDrop" }
  | { readonly type: "pause" }
  | { readonly type: "resume" }
  | { readonly type: "restart"; readonly seed?: number }
  | { readonly type: "setClassic"; readonly on: boolean };

export type GameEvent =
  | { readonly type: "spawn" }
  | { readonly type: "shift" }
  | { readonly type: "rotate" }
  | { readonly type: "lock"; readonly cells: readonly Point[] }
  | { readonly type: "hardDrop"; readonly distance: number }
  | { readonly type: "clear"; readonly rows: readonly number[] }
  | { readonly type: "levelUp"; readonly level: number }
  | { readonly type: "gameOver" };

/**
 * Selector state: the RNG position, plus the memory the variety guards and the
 * intent hysteresis need. Intent is carried between spawns on purpose -- reading
 * it fresh from the board each time is what let danger oscillate and let a
 * forgotten dig run forever.
 */
export type SelectorState = {
  readonly rng: number;
  /** Kinds delivered most recently, newest first, capped at STARVE_LIMIT. */
  readonly recent: readonly Kind[];
  /** The previous spawn's intent. */
  readonly intent: Intent;
  /** Consecutive spawns spent digging, so a stalled dig can be given up on. */
  readonly digAge: number;
  /** Remaining kinds of the current shuffle. Only the classic 7-bag path uses it. */
  readonly queue: readonly Kind[];
  /** Draw from a plain shuffle instead of reading the board. For comparison. */
  readonly classic: boolean;
};

export type GameState = {
  readonly phase: Phase;
  /** Phase to return to on resume; only meaningful while paused. */
  readonly resumePhase: "playing" | "clearing";
  readonly board: Board;
  readonly active: Piece | null;
  readonly selector: SelectorState;
  readonly nextRowId: number;
  /** Milliseconds accumulated toward the next gravity step. */
  readonly gravityAcc: number;
  /** Milliseconds the piece has rested on the stack. */
  readonly lockTimer: number;
  /** Lock-delay resets used by the current piece since its last new lowest row. */
  readonly lockResets: number;
  /** Lowest bounding-box row the current piece has reached. */
  readonly lowestRow: number;
  readonly softDropping: boolean;
  readonly clearing: {
    readonly rows: readonly number[];
    readonly elapsed: number;
  } | null;
  readonly linesCleared: number;
  /** Pieces spawned so far; lets the UI tell a new piece from a moved one. */
  readonly pieceCount: number;
  readonly events: readonly GameEvent[];
};

/** What the board suggests the player is doing. Selects a weight set, not a piece. */
export type Intent = "survive" | "tetrisReady" | "tetrisForming" | "repair" | "build";

/**
 * How much each feature of a resulting board is worth under one intent. Clear
 * values are indexed by the number of rows a placement clears, so a weight set
 * can reward a four-line clear while punishing the single that would spoil it.
 */
export type Weights = {
  readonly clear: readonly [number, number, number, number, number];
  readonly holes: number;
  readonly bumpiness: number;
  readonly aggregateHeight: number;
  readonly maxHeight: number;
  readonly wellKept: number;
};

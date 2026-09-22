import {
  DEAD_ZONE_CELLS,
  DEAD_ZONE_MIN_PX,
  FLICK_MIN_TRAVEL,
  FLICK_VELOCITY,
  FLICK_WINDOW_MS,
  STALE_POINTER_MS,
  TAP_MAX_MS,
} from "../engine/config.ts";
import type { Action } from "../engine/types.ts";

export type PointerSample = {
  readonly x: number;
  readonly y: number;
  /** Milliseconds, same clock for every sample of a gesture. */
  readonly t: number;
};

export type GestureContext = {
  readonly cellPx: number;
  /** Column of the active piece, or null when there is none. */
  readonly activeCol: number | null;
};

type Axis = "none" | "horizontal" | "vertical";

export type RecognizerState = {
  readonly pointerId: number | null;
  readonly start: PointerSample | null;
  readonly axis: Axis;
  /** Finger x and piece column that are "attached"; travel from here moves the piece. */
  readonly anchorX: number;
  readonly anchorCol: number | null;
  /** Column last requested, to detect when the piece could not follow. */
  readonly lastTarget: number | null;
  /** Finger y where the vertical gesture started and rows already dropped from it. */
  readonly anchorY: number;
  readonly rowsDropped: number;
  /** Recent samples, newest last, for release velocity. */
  readonly history: readonly PointerSample[];
  /** When the held pointer was last heard from, to tell a still finger from a lost one. */
  readonly lastT: number;
};

export function createRecognizer(): RecognizerState {
  return {
    pointerId: null,
    start: null,
    axis: "none",
    anchorX: 0,
    anchorCol: null,
    lastTarget: null,
    anchorY: 0,
    rowsDropped: 0,
    history: [],
    lastT: 0,
  };
}

function deadZonePx(cellPx: number): number {
  return Math.max(DEAD_ZONE_MIN_PX, DEAD_ZONE_CELLS * cellPx);
}

function remember(history: readonly PointerSample[], sample: PointerSample): PointerSample[] {
  const cutoff = sample.t - FLICK_WINDOW_MS;
  const kept = history.filter((s) => s.t >= cutoff);
  // Keep the last sample before the window so a slow release still has a reference.
  const older = history.filter((s) => s.t < cutoff);
  const tail = older.length > 0 ? [older[older.length - 1]] : [];
  return [...tail, ...kept, sample];
}

export function pointerDown(
  state: RecognizerState,
  pointerId: number,
  sample: PointerSample,
): RecognizerState {
  // A second finger is refused while the first one is still playing. But a
  // pointer the browser never closed -- the OS took the gesture mid-drag and
  // neither pointerup nor pointercancel followed -- would hold that place for
  // good, and every touch after it would be dropped in silence. A held pointer
  // that has not been heard from in STALE_POINTER_MS is one of those, so the
  // new touch takes over; a finger that is really still down keeps reporting.
  if (state.pointerId !== null && sample.t - state.lastT < STALE_POINTER_MS) return state;
  return {
    ...createRecognizer(),
    pointerId,
    start: sample,
    history: [sample],
    lastT: sample.t,
  };
}

export function pointerCancel(state: RecognizerState, pointerId: number): RecognizerState {
  return state.pointerId === pointerId ? createRecognizer() : state;
}

function shiftsToward(from: number, to: number): Action[] {
  const dx = to > from ? 1 : -1;
  return Array.from({ length: Math.abs(to - from) }, (): Action => ({ type: "shift", dx }));
}

function trackHorizontal(
  state: RecognizerState,
  sample: PointerSample,
  ctx: GestureContext,
): [RecognizerState, Action[]] {
  if (ctx.activeCol === null) return [{ ...state, anchorCol: null, lastTarget: null }, []];
  let { anchorX, anchorCol } = state;
  // The piece could not follow the last request (wall, stack, or a new piece): re-attach it here.
  if (anchorCol === null || (state.lastTarget !== null && ctx.activeCol !== state.lastTarget)) {
    anchorX = sample.x;
    anchorCol = ctx.activeCol;
  }
  const target = anchorCol + Math.round((sample.x - anchorX) / ctx.cellPx);
  const actions = target === ctx.activeCol ? [] : shiftsToward(ctx.activeCol, target);
  return [{ ...state, anchorX, anchorCol, lastTarget: target }, actions];
}

function trackVertical(
  state: RecognizerState,
  sample: PointerSample,
  ctx: GestureContext,
): [RecognizerState, Action[]] {
  const rows = Math.max(state.rowsDropped, Math.floor((sample.y - state.anchorY) / ctx.cellPx));
  const actions = Array.from({ length: rows - state.rowsDropped }, (): Action => ({
    type: "dropStep",
  }));
  return [{ ...state, rowsDropped: rows }, actions];
}

export function pointerMove(
  state: RecognizerState,
  pointerId: number,
  sample: PointerSample,
  ctx: GestureContext,
): [RecognizerState, Action[]] {
  if (state.pointerId !== pointerId || state.start === null) return [state, []];
  // The gesture is alive even where it cannot be read, so the clock runs first:
  // a finger held still must never be mistaken for one the browser dropped.
  const alive: RecognizerState = { ...state, lastT: sample.t };
  // Every conversion below divides by cellPx, which is 0 until the board has
  // been measured -- and stays 0 where the layout gives it no width at all.
  if (ctx.cellPx <= 0) return [alive, []];
  let next: RecognizerState = { ...alive, history: remember(state.history, sample) };

  if (next.axis === "none") {
    const dx = sample.x - state.start.x;
    const dy = sample.y - state.start.y;
    if (Math.abs(dx) < deadZonePx(ctx.cellPx) && Math.abs(dy) < deadZonePx(ctx.cellPx)) {
      return [next, []];
    }
    next =
      Math.abs(dx) >= Math.abs(dy)
        ? { ...next, axis: "horizontal", anchorX: state.start.x, anchorCol: ctx.activeCol }
        : { ...next, axis: "vertical", anchorY: state.start.y, rowsDropped: 0 };
  }

  return next.axis === "horizontal"
    ? trackHorizontal(next, sample, ctx)
    : trackVertical(next, sample, ctx);
}

/** Downward release speed in cells per millisecond over the flick window. */
function releaseVelocity(
  history: readonly PointerSample[],
  up: PointerSample,
  cellPx: number,
): number {
  const cutoff = up.t - FLICK_WINDOW_MS;
  const inWindow = history.filter((s) => s.t >= cutoff && s.t < up.t);
  const reference = inWindow[0] ?? history.filter((s) => s.t < up.t).at(-1);
  if (reference === undefined || up.t === reference.t) return 0;
  return (up.y - reference.y) / (up.t - reference.t) / cellPx;
}

export function pointerUp(
  state: RecognizerState,
  pointerId: number,
  sample: PointerSample,
  ctx: GestureContext,
): [RecognizerState, Action[]] {
  if (state.pointerId !== pointerId || state.start === null) return [state, []];
  const reset = createRecognizer();

  if (state.axis === "none") {
    const isTap = sample.t - state.start.t <= TAP_MAX_MS;
    return [reset, isTap ? [{ type: "rotate", dir: 1 }] : []];
  }

  if (state.axis === "vertical" && ctx.cellPx > 0) {
    const travel = (sample.y - state.start.y) / ctx.cellPx;
    const velocity = releaseVelocity(state.history, sample, ctx.cellPx);
    if (travel >= FLICK_MIN_TRAVEL && velocity >= FLICK_VELOCITY) {
      return [reset, [{ type: "hardDrop" }]];
    }
  }

  return [reset, []];
}

import { ARR_MS, DAS_MS, MAX_FRAME_DT_MS } from "../engine/config.ts";
import type { Action } from "../engine/types.ts";

/**
 * What the keyboard layer emits: engine actions, plus two commands that need
 * the game phase to interpret (the UI turns them into start, restart, pause
 * or resume).
 */
export type Command = Action | { readonly type: "confirm" } | { readonly type: "togglePause" };

type Direction = -1 | 1;

export type KeyboardState = {
  /** Game keys currently held, used to ignore OS key repeat. */
  readonly pressed: ReadonlySet<string>;
  readonly direction: Direction | null;
  /** Timestamp of the next auto-repeat shift. */
  readonly nextRepeat: number | null;
};

type Binding =
  | { readonly kind: "direction"; readonly dx: Direction }
  | { readonly kind: "softDrop" }
  | { readonly kind: "commands"; readonly commands: readonly Command[] };

const BINDINGS: Readonly<Record<string, Binding>> = {
  ArrowLeft: { kind: "direction", dx: -1 },
  ArrowRight: { kind: "direction", dx: 1 },
  ArrowDown: { kind: "softDrop" },
  ArrowUp: { kind: "commands", commands: [{ type: "rotate", dir: 1 }] },
  x: { kind: "commands", commands: [{ type: "rotate", dir: 1 }] },
  z: { kind: "commands", commands: [{ type: "rotate", dir: -1 }] },
  " ": { kind: "commands", commands: [{ type: "hardDrop" }, { type: "confirm" }] },
  Enter: { kind: "commands", commands: [{ type: "confirm" }] },
  p: { kind: "commands", commands: [{ type: "togglePause" }] },
  Escape: { kind: "commands", commands: [{ type: "togglePause" }] },
};

/** Single letters are matched case-insensitively so Shift does not break them. */
function normalize(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

export function isGameKey(key: string): boolean {
  return normalize(key) in BINDINGS;
}

export function createKeyboard(): KeyboardState {
  return { pressed: new Set(), direction: null, nextRepeat: null };
}

function withPressed(state: KeyboardState, key: string, down: boolean): ReadonlySet<string> {
  const pressed = new Set(state.pressed);
  if (down) pressed.add(key);
  else pressed.delete(key);
  return pressed;
}

function otherDirectionHeld(pressed: ReadonlySet<string>, dx: Direction): Direction | null {
  const other: Direction = dx === 1 ? -1 : 1;
  return pressed.has(other === 1 ? "ArrowRight" : "ArrowLeft") ? other : null;
}

export function keyDown(
  state: KeyboardState,
  rawKey: string,
  t: number,
): [KeyboardState, Command[]] {
  const key = normalize(rawKey);
  const binding = BINDINGS[key];
  if (binding === undefined || state.pressed.has(key)) return [state, []];
  const pressed = withPressed(state, key, true);
  switch (binding.kind) {
    case "direction":
      return [
        { pressed, direction: binding.dx, nextRepeat: t + DAS_MS },
        [{ type: "shift", dx: binding.dx }],
      ];
    case "softDrop":
      return [{ ...state, pressed }, [{ type: "softDrop", on: true }]];
    case "commands":
      return [{ ...state, pressed }, [...binding.commands]];
  }
}

export function keyUp(state: KeyboardState, rawKey: string, t: number): [KeyboardState, Command[]] {
  const key = normalize(rawKey);
  const binding = BINDINGS[key];
  if (binding === undefined) return [state, []];
  const pressed = withPressed(state, key, false);
  if (binding.kind === "softDrop")
    return [{ ...state, pressed }, [{ type: "softDrop", on: false }]];
  if (binding.kind === "direction" && state.direction === binding.dx) {
    const fallback = otherDirectionHeld(pressed, binding.dx);
    return [
      { pressed, direction: fallback, nextRepeat: fallback === null ? null : t + DAS_MS },
      [],
    ];
  }
  return [{ ...state, pressed }, []];
}

export function tick(state: KeyboardState, t: number): [KeyboardState, Command[]] {
  if (state.direction === null || state.nextRepeat === null || t < state.nextRepeat) {
    return [state, []];
  }
  const commands: Command[] = [];
  // Catch up over one frame's worth of backlog at most. A stalled frame would
  // otherwise slide the piece to the wall in one step, while the same frame's
  // gravity is held to MAX_FRAME_DT_MS.
  let nextRepeat = Math.max(state.nextRepeat, t - MAX_FRAME_DT_MS);
  while (t >= nextRepeat) {
    commands.push({ type: "shift", dx: state.direction });
    nextRepeat += ARR_MS;
  }
  return [{ ...state, nextRepeat }, commands];
}

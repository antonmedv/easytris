import { describe, expect, it } from "vitest";

import { fits } from "./board.ts";
import { COLS, ROWS } from "./config.ts";
import { createGame, reduce } from "./game.ts";
import { nextRandom } from "./rng.ts";
import type { Action, GameState, Phase } from "./types.ts";

const SEEDS = 50;
const STEPS = 2000;

/** Phase transitions the spec diagram allows, including restart into playing. */
const ALLOWED: Readonly<Record<Phase, readonly Phase[]>> = {
  ready: ["ready", "playing", "over"],
  playing: ["playing", "clearing", "paused", "over"],
  clearing: ["clearing", "playing", "paused", "over"],
  paused: ["paused", "playing", "clearing"],
  over: ["over", "playing"],
};

/** Random actions weighted toward ticks so games actually progress. */
function randomAction(rng: number): [Action, number] {
  const [roll, next] = nextRandom(rng);
  const [second, after] = nextRandom(next);
  if (roll < 0.6) return [{ type: "tick", dtMs: 1 + Math.floor(second * 120) }, after];
  if (roll < 0.72) return [{ type: "shift", dx: second < 0.5 ? -1 : 1 }, after];
  if (roll < 0.8) return [{ type: "rotate", dir: second < 0.5 ? -1 : 1 }, after];
  if (roll < 0.85) return [{ type: "softDrop", on: second < 0.5 }, after];
  if (roll < 0.9) return [{ type: "dropStep" }, after];
  if (roll < 0.95) return [{ type: "hardDrop" }, after];
  if (roll < 0.97) return [{ type: "pause" }, after];
  if (roll < 0.99) return [{ type: "resume" }, after];
  if (roll < 0.995) return [{ type: "start" }, after];
  return [{ type: "restart", seed: Math.floor(second * 1000) }, after];
}

function checkInvariants(prev: GameState, next: GameState, action: Action, where: string): void {
  const fail = (message: string): never => {
    throw new Error(`${where}: ${message} (after ${action.type})`);
  };

  if (next.board.length !== ROWS) fail(`board has ${next.board.length} rows`);
  const ids = new Set(next.board.map((row) => row.id));
  if (ids.size !== ROWS) fail("row ids are not unique");
  for (const row of next.board) {
    if (row.cells.length !== COLS) fail(`row ${row.id} has ${row.cells.length} cells`);
  }

  if (next.active !== null && !fits(next.board, next.active))
    fail("active piece overlaps the stack");
  if (next.phase === "playing" && next.active === null) fail("playing without an active piece");
  if (next.phase !== "playing" && next.phase !== "paused" && next.active !== null) {
    fail(`active piece present in phase ${next.phase}`);
  }

  if (!ALLOWED[prev.phase].includes(next.phase)) fail(`${prev.phase} -> ${next.phase}`);

  if (action.type !== "restart" && next.linesCleared < prev.linesCleared) fail("lines decreased");

  for (const [name, value] of [
    ["gravityAcc", next.gravityAcc],
    ["lockTimer", next.lockTimer],
    ["clearing.elapsed", next.clearing?.elapsed ?? 0],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) fail(`${name} is ${value}`);
  }
}

function play(seed: number): GameState {
  let state = createGame(seed);
  let rng = seed * 7919 + 1;
  for (let step = 0; step < STEPS; step++) {
    const [action, next] = randomAction(rng);
    rng = next;
    const after = reduce(state, action);
    checkInvariants(state, after, action, `seed ${seed} step ${step}`);
    state = after;
  }
  return state;
}

/**
 * Each spawn evaluates every placement of all seven kinds, so these two sweeps
 * do real work. They stay inside the per-spawn budget -- measured p99 is about
 * 1 ms against a 2 ms ceiling -- but coverage instrumentation multiplies the
 * wall clock enough to pass the default five-second limit.
 */
const SWEEP_TIMEOUT_MS = 60_000;

describe("engine invariants under random play", () => {
  it(
    `hold for ${SEEDS} seeds x ${STEPS} random actions`,
    () => {
      const finalPhases = new Set<Phase>();
      for (let seed = 1; seed <= SEEDS; seed++) {
        finalPhases.add(play(seed).phase);
      }
      // Sanity: random play should reach more than one phase overall.
      expect(finalPhases.size).toBeGreaterThan(1);
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    "actually progresses games: some seeds clear lines or end",
    () => {
      let progressed = 0;
      for (let seed = 1; seed <= SEEDS; seed++) {
        const end = play(seed);
        if (end.linesCleared > 0 || end.phase === "over") progressed++;
      }
      expect(progressed).toBeGreaterThan(0);
    },
    SWEEP_TIMEOUT_MS,
  );
});

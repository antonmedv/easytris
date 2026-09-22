import { describe, expect, it } from "vitest";

import { MAX_REPEAT } from "./config.ts";
import { createSelector, nextKind } from "./selector.ts";
import { boardFrom, playGame, type BotSkill } from "./testing.ts";
import { KINDS } from "./tetrominoes.ts";
import type { Intent, Kind } from "./types.ts";

const MINUTES = 900_000;

/** Real work allowed per spawn, so selection never costs a frame. */
const SPAWN_BUDGET_MS = 2;

/**
 * Coverage instrumentation roughly doubles the wall clock -- measured 1.0 ms
 * against 2.5 ms for the same work -- and the budget is about what a player's
 * machine does, not what a profiler does. Allowing three times the budget under
 * instrumentation still catches any regression worth the name.
 */
function spawnBudgetMs(): number {
  const worker = (globalThis as Record<string, unknown>)["__vitest_worker__"] as
    | { ctx?: { config?: { coverage?: { enabled?: boolean } } } }
    | undefined;
  return worker?.ctx?.config?.coverage?.enabled === true ? SPAWN_BUDGET_MS * 3 : SPAWN_BUDGET_MS;
}

type Sample = {
  readonly kinds: readonly Kind[];
  readonly intents: readonly Intent[];
  readonly longestRun: number;
  /** Spawns at which each kind could have entered the board at all. */
  readonly chances: Readonly<Record<Kind, number>>;
  /** Kinds the board admitted at each spawn that ran a kind past the cap. */
  readonly overCap: readonly number[];
};

/** Plays until at least `target` pieces have been dealt, pooling what came out. */
function sample(skill: BotSkill, target: number): Sample {
  const kinds: Kind[] = [];
  const intents: Intent[] = [];
  const chances = Object.fromEntries(KINDS.map((kind) => [kind, 0])) as Record<Kind, number>;
  const overCap: number[] = [];
  let longestRun = 1;
  for (let seed = 1; kinds.length < target && seed < 400; seed++) {
    const game = playGame(seed, { skill, maxPieces: 300 });
    let run = 1;
    for (let i = 0; i < game.kinds.length; i++) {
      for (const kind of game.admitted[i]) chances[kind]++;
      if (i === 0) continue;
      run = game.kinds[i] === game.kinds[i - 1] ? run + 1 : 1;
      if (run > longestRun) longestRun = run;
      if (run > MAX_REPEAT) overCap.push(game.admitted[i].length);
    }
    kinds.push(...game.kinds);
    intents.push(...game.intents);
  }
  return { kinds, intents, longestRun, chances, overCap };
}

function shareOf<T>(values: readonly T[], match: T): number {
  return values.filter((value) => value === match).length / values.length;
}

describe("the piece mix still looks like chance", () => {
  const healthy = sample("best", 10_000);
  const struggling = sample("fallible", 10_000);

  it(
    "gives every kind a fair share of a healthy game",
    () => {
      // Uniform would be 14.3%; the selector leans toward whatever the board wants,
      // so the band is wide but real.
      for (const kind of KINDS) {
        const share = shareOf(healthy.kinds, kind);
        expect(share, `${kind} share`).toBeGreaterThan(0.08);
        expect(share, `${kind} share`).toBeLessThan(0.25);
      }
    },
    MINUTES,
  );

  it(
    "never starves a kind even when the player is in trouble",
    () => {
      // Under duress the selector leans much harder on the piece that rescues, so
      // the ceiling goes, but nothing may disappear.
      //
      // Measured against the spawns where the kind could have entered rather than
      // against every spawn. Near the ceiling the board refuses kinds outright,
      // and a kind the board would not admit is not one the selector withheld;
      // counting those against it would read the game's own walls as favouritism.
      for (const kind of KINDS) {
        const dealt = struggling.kinds.filter((value) => value === kind).length;
        expect(dealt / struggling.chances[kind], `${kind} share`).toBeGreaterThan(0.08);
      }
    },
    MINUTES,
  );

  it(
    "repeats a kind past the cap only when nothing else can enter",
    () => {
      // The cap is a preference and it yields, but only to the board: every run
      // past it must be a stretch where the spawn columns admitted one kind and
      // the alternative was ending a game that was still playable.
      expect(healthy.overCap).toEqual([]);
      expect(new Set(struggling.overCap)).toEqual(
        new Set(struggling.overCap.length > 0 ? [1] : []),
      );
    },
    MINUTES,
  );

  it(
    "keeps cruising reachable rather than retiring it at the first mistake",
    () => {
      // A single hole must not pin the game in repair for good.
      expect(shareOf(healthy.intents, "build")).toBeGreaterThan(0.15);
    },
    MINUTES,
  );
});

describe("the selector earns its place", () => {
  it(
    "doubles what a fallible player clears",
    () => {
      // The bot must not share the selector's optimum: a bot that always finds the
      // best placement measures the feature on the player who needs it least, and
      // would report a far smaller gain.
      let assisted = 0;
      let plain = 0;
      for (let seed = 1; seed <= 30; seed++) {
        assisted += playGame(seed, { skill: "fallible", maxPieces: 300 }).lines;
        plain += playGame(seed, { skill: "fallible", maxPieces: 300, classic: true }).lines;
      }
      expect(assisted).toBeGreaterThan(plain * 2);
    },
    MINUTES,
  );

  it(
    "helps a strong player much less, which is the point",
    () => {
      let assisted = 0;
      let plain = 0;
      for (let seed = 1; seed <= 10; seed++) {
        assisted += playGame(seed, { skill: "best", maxPieces: 300 }).lines;
        plain += playGame(seed, { skill: "best", maxPieces: 300, classic: true }).lines;
      }
      expect(assisted).toBeGreaterThan(plain);
      expect(assisted).toBeLessThan(plain * 2);
    },
    MINUTES,
  );

  it(
    "still lets a bad player lose",
    () => {
      // Assistance is not a safety net.
      for (let seed = 1; seed <= 5; seed++) {
        expect(playGame(seed, { skill: "worst", maxPieces: 300 }).toppedOut).toBe(true);
      }
    },
    MINUTES,
  );
});

describe("selection stays cheap", () => {
  it(
    "costs well under the per-spawn budget",
    () => {
      const boards = [
        boardFrom([]),
        boardFrom(["XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX.", "X..XXXXXX."]),
        boardFrom(Array(14).fill("XXXX...XXX")),
      ];
      const samples: number[] = [];
      let selector = createSelector(1);
      for (let i = 0; i < 2000; i++) {
        const board = boards[i % boards.length];
        const start = performance.now();
        selector = nextKind(board, selector)[1];
        samples.push(performance.now() - start);
      }
      samples.sort((left, right) => left - right);
      expect(samples[Math.floor(samples.length * 0.99)]).toBeLessThan(spawnBudgetMs());
    },
    MINUTES,
  );
});

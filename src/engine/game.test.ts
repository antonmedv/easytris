import { describe, expect, it } from "vitest";

import { cellsOf, dropDistance } from "./board.ts";
import {
  BUFFER_ROWS,
  CLEAR_ANIMATION_MS,
  LOCK_DELAY_MS,
  LOCK_RESET_LIMIT,
  ROWS,
  SOFT_DROP_MS,
} from "./config.ts";
import { createGame, NO_EVENTS, reduce } from "./game.ts";
import { gravityMs } from "./gravity.ts";
import { createSelector, nextKind } from "./selector.ts";
import {
  activeOf,
  boardFrom,
  countFilled,
  groundedPiece,
  rowStrings,
  seedFor,
  startGame,
  withActive,
  withBoard,
} from "./testing.ts";
import { SPAWN_COL } from "./tetrominoes.ts";
import type { Action, GameState } from "./types.ts";

function tick(state: GameState, dtMs: number): GameState {
  return reduce(state, { type: "tick", dtMs });
}

describe("createGame", () => {
  it("starts in the ready phase with an empty board and no piece", () => {
    const game = createGame(1);
    expect(game.phase).toBe("ready");
    expect(game.active).toBeNull();
    expect(countFilled(game.board)).toBe(0);
    expect(game.linesCleared).toBe(0);
    expect(game.events).toEqual([]);
  });
});

describe("start", () => {
  it("spawns the selector's first kind with its top on the first visible row", () => {
    const seed = 5;
    const [expectedKind] = nextKind(boardFrom([]), createSelector(seed));
    const game = startGame(seed);

    expect(game.phase).toBe("playing");
    expect(game.active?.kind).toBe(expectedKind);
    expect(game.active?.rotation).toBe(0);
    expect(game.active?.col).toBe(SPAWN_COL[expectedKind]);
    const topRow = Math.min(...cellsOf(activeOf(game)).map((cell) => cell.row));
    expect(topRow).toBe(BUFFER_ROWS);
    expect(game.events).toEqual([{ type: "spawn" }]);
  });

  it("spawns into the buffer when the top visible row is blocked", () => {
    const blockedTop = boardFrom([
      "...XXXX...",
      ...Array.from({ length: ROWS - BUFFER_ROWS - 1 }, () => ".........."),
    ]);
    const ready = withBoard(createGame(seedFor("T")), blockedTop);

    const game = reduce(ready, { type: "start" });

    // Which kind arrives is the selector's business and depends on this board,
    // not on the seed. What matters here is that spawning lifted it clear of the
    // blockage instead of failing, so the assertion is about the lift.
    expect(game.phase).toBe("playing");
    expect(activeOf(game).row).toBe(0);
    expect(Math.min(...cellsOf(activeOf(game)).map((cell) => cell.row))).toBeLessThan(BUFFER_ROWS);
  });

  it("ends the game immediately when no spawn position fits (block out)", () => {
    const blocked = boardFrom(Array.from({ length: ROWS }, () => "...XXXX..."));
    const ready = withBoard(createGame(seedFor("T")), blocked);

    const game = reduce(ready, { type: "start" });

    expect(game.phase).toBe("over");
    expect(game.active).toBeNull();
    expect(game.events).toEqual([{ type: "gameOver" }]);
  });

  it("is ignored outside the ready phase", () => {
    const playing = startGame(1);
    expect(reduce(playing, { type: "start" }).active).toEqual(playing.active);
  });

  it("counts spawned pieces", () => {
    expect(createGame(1).pieceCount).toBe(0);
    const game = startGame(1);
    expect(game.pieceCount).toBe(1);
    expect(reduce(game, { type: "hardDrop" }).pieceCount).toBe(2);
  });
});

describe("gravity", () => {
  it("moves the piece down one row each gravity interval", () => {
    const game = startGame(1);
    const startRow = activeOf(game).row;

    const almost = tick(game, gravityMs(0) - 1);
    expect(almost.active?.row).toBe(startRow);

    const fallen = tick(almost, 1);
    expect(fallen.active?.row).toBe(startRow + 1);

    const twoMore = tick(fallen, gravityMs(0) * 2);
    expect(twoMore.active?.row).toBe(startRow + 3);
  });

  it("keeps board and piece references when a tick changes nothing visible", () => {
    const game = startGame(1);
    const next = tick(game, 10);
    expect(next.board).toBe(game.board);
    expect(next.active).toBe(game.active);
    expect(next.events).toEqual([]);
  });

  it("clears the previous step's events on a quiet tick", () => {
    const game = startGame(1);
    expect(game.events.length).toBeGreaterThan(0);
    expect(tick(game, 1).events).toEqual([]);
  });
});

describe("lock delay", () => {
  it("locks a grounded piece exactly LOCK_DELAY_MS after it lands", () => {
    const grounded = groundedPiece();
    const piece = activeOf(grounded);

    const waiting = tick(grounded, LOCK_DELAY_MS - 1);
    expect(waiting.active).toBe(piece);
    expect(countFilled(waiting.board)).toBe(0);

    const locked = tick(waiting, 1);
    expect(countFilled(locked.board)).toBe(4);
    expect(rowStrings(locked.board).slice(-2)).toEqual(["....T.....", "...TTT...."]);
  });

  it("emits lock with the locked cells followed by spawn, and spawns a new piece", () => {
    const grounded = groundedPiece();
    const locked = tick(grounded, LOCK_DELAY_MS);

    expect(locked.events).toEqual([
      { type: "lock", cells: cellsOf(activeOf(grounded)) },
      { type: "spawn" },
    ]);
    expect(locked.phase).toBe("playing");
    expect(locked.active).not.toBeNull();
    expect(locked.active?.row).toBeLessThanOrEqual(BUFFER_ROWS);
  });

  it("ends the game when a piece locks entirely inside the buffer rows (lock out)", () => {
    const tallStack = boardFrom(Array.from({ length: ROWS - BUFFER_ROWS }, () => "...XXX...."));
    const state = withActive(withBoard(startGame(1), tallStack), {
      kind: "T",
      rotation: 0,
      row: 0,
      col: 3,
    });

    const over = tick(state, LOCK_DELAY_MS);

    expect(over.phase).toBe("over");
    expect(over.active).toBeNull();
    expect(over.events.map((event) => event.type)).toEqual(["lock", "gameOver"]);
  });
});

describe("shift", () => {
  it("moves the piece one column and emits a shift event", () => {
    const game = startGame(1);
    const col = activeOf(game).col;
    const right = reduce(game, { type: "shift", dx: 1 });
    expect(activeOf(right).col).toBe(col + 1);
    expect(right.events).toEqual([{ type: "shift" }]);
    expect(activeOf(reduce(right, { type: "shift", dx: -1 })).col).toBe(col);
  });

  it("returns the same state when blocked by the wall", () => {
    const game = tick(withActive(startGame(1), { kind: "T", rotation: 0, row: 5, col: 7 }), 1);
    const blocked = reduce(game, { type: "shift", dx: 1 });
    expect(blocked).toBe(game);
  });

  it("is ignored outside the playing phase", () => {
    const ready = createGame(1);
    expect(reduce(ready, { type: "shift", dx: 1 })).toBe(ready);
  });
});

describe("rotate", () => {
  it("rotates the piece with SRS and emits a rotate event", () => {
    const game = withActive(startGame(1), { kind: "T", rotation: 0, row: 5, col: 3 });
    const turned = reduce(game, { type: "rotate", dir: 1 });
    expect(activeOf(turned).rotation).toBe(1);
    expect(turned.events).toEqual([{ type: "rotate" }]);
  });

  it("emits nothing when the rotation is impossible", () => {
    const game = tick(withActive(startGame(1), { kind: "O", rotation: 0, row: 5, col: 4 }), 1);
    expect(reduce(game, { type: "rotate", dir: 1 })).toBe(game);
  });
});

describe("soft drop", () => {
  it("falls one row per SOFT_DROP_MS while on, then returns to gravity when off", () => {
    const game = startGame(1);
    const row = activeOf(game).row;
    const dropping = reduce(game, { type: "softDrop", on: true });

    const fast = tick(dropping, SOFT_DROP_MS * 5);
    expect(activeOf(fast).row).toBe(row + 5);

    const released = reduce(fast, { type: "softDrop", on: false });
    const slow = tick(released, SOFT_DROP_MS * 5);
    expect(activeOf(slow).row).toBe(row + 5);
  });

  it("dropStep moves one row when free and does nothing when grounded", () => {
    const game = startGame(1);
    const row = activeOf(game).row;
    const stepped = reduce(game, { type: "dropStep" });
    expect(activeOf(stepped).row).toBe(row + 1);
    expect(stepped.events).toEqual([]);

    const grounded = tick(groundedPiece(), 1);
    expect(reduce(grounded, { type: "dropStep" })).toBe(grounded);
  });
});

describe("hard drop", () => {
  it("drops to the ghost position, locks at once, and reports the distance", () => {
    const game = startGame(1);
    const piece = activeOf(game);
    const distance = dropDistance(game.board, piece);

    const dropped = reduce(game, { type: "hardDrop" });

    expect(countFilled(dropped.board)).toBe(4);
    expect(dropped.events).toEqual([
      { type: "hardDrop", distance },
      { type: "lock", cells: cellsOf({ ...piece, row: piece.row + distance }) },
      { type: "spawn" },
    ]);
    expect(dropped.active).not.toBeNull();
    expect(dropped.active).not.toEqual(piece);
  });
});

describe("lock reset", () => {
  it("restarts the lock delay on a successful shift while grounded", () => {
    let s = groundedPiece();
    s = tick(s, 400);
    s = reduce(s, { type: "shift", dx: 1 });
    s = tick(s, 400);
    expect(countFilled(s.board)).toBe(0);
    s = tick(s, 100);
    expect(countFilled(s.board)).toBe(4);
  });

  it("stops resetting after LOCK_RESET_LIMIT moves on the same row", () => {
    let s = groundedPiece();
    for (let i = 0; i < LOCK_RESET_LIMIT; i++) {
      s = tick(s, 400);
      s = reduce(s, { type: "shift", dx: i % 2 === 0 ? 1 : -1 });
      expect(countFilled(s.board)).toBe(0);
    }
    s = tick(s, 400);
    s = reduce(s, { type: "shift", dx: 1 });
    s = tick(s, 100);
    expect(countFilled(s.board)).toBe(4);
  });

  it("re-arms the reset budget when the piece reaches a new lowest row", () => {
    // A one-row platform under columns 0-5. The T rests on it with its budget spent.
    const platform = boardFrom(["XXXXXX...."]);
    let s = withActive(withBoard(startGame(1), platform), {
      kind: "T",
      rotation: 0,
      row: 19,
      col: 5,
    });
    s = { ...s, lockResets: LOCK_RESET_LIMIT };

    s = tick(s, 400);
    s = reduce(s, { type: "shift", dx: 1 }); // off the platform edge, budget spent: no reset
    expect(s.lockTimer).toBe(400);
    s = tick(s, gravityMs(0)); // falls one row to the floor: new lowest row
    expect(activeOf(s).row).toBe(20);
    expect(s.lockResets).toBe(0);

    s = tick(s, 400);
    s = reduce(s, { type: "shift", dx: 1 }); // budget re-armed: this resets
    s = tick(s, 400);
    expect(countFilled(s.board)).toBe(6);
    s = tick(s, 100);
    expect(countFilled(s.board)).toBe(10);
  });
});

describe("line clears", () => {
  /** A vertical I whose bottom cells complete the rows of a nine-wide stack. */
  function iOnNineWideStack(rows: string[]): GameState {
    const state = withBoard(startGame(1), boardFrom(rows));
    return withActive(state, { kind: "I", rotation: 1, row: 18, col: 7 });
  }

  it("enters the clearing phase with the full rows still on the board", () => {
    const grounded = iOnNineWideStack(["XXXXXXXXX.", "XXXXXXXXX."]);
    const filledBefore = countFilled(grounded.board);

    const locked = tick(grounded, LOCK_DELAY_MS);

    expect(locked.phase).toBe("clearing");
    expect(locked.clearing).toEqual({ rows: [20, 21], elapsed: 0 });
    expect(locked.active).toBeNull();
    expect(countFilled(locked.board)).toBe(filledBefore + 4);
    expect(locked.events.map((event) => event.type)).toEqual(["lock", "clear"]);
    expect(locked.events[1]).toEqual({ type: "clear", rows: [20, 21] });
  });

  it("clears one to four rows", () => {
    const one = withActive(withBoard(startGame(1), boardFrom(["XXXXXX...."])), {
      kind: "I",
      rotation: 0,
      row: 20,
      col: 6,
    });
    expect(tick(one, LOCK_DELAY_MS).clearing?.rows).toEqual([21]);

    const three = iOnNineWideStack(["..........", "XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX."]);
    expect(tick(three, LOCK_DELAY_MS).clearing?.rows).toEqual([19, 20, 21]);

    const four = iOnNineWideStack(["XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX."]);
    expect(tick(four, LOCK_DELAY_MS).clearing?.rows).toEqual([18, 19, 20, 21]);
  });

  it("removes the rows after CLEAR_ANIMATION_MS, keeps survivor ids, counts lines, and spawns", () => {
    const grounded = iOnNineWideStack(["..........", "XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX."]);
    const survivorId = grounded.board[18].id;
    const clearing = tick(grounded, LOCK_DELAY_MS);

    const midway = tick(clearing, CLEAR_ANIMATION_MS - 1);
    expect(midway.phase).toBe("clearing");
    expect(midway.clearing?.elapsed).toBe(CLEAR_ANIMATION_MS - 1);
    expect(midway.board).toBe(clearing.board);

    const done = tick(midway, 1);
    expect(done.phase).toBe("playing");
    expect(done.clearing).toBeNull();
    expect(done.linesCleared).toBe(3);
    expect(rowStrings(done.board).slice(-1)).toEqual([".........I"]);
    expect(done.board[21].id).toBe(survivorId);
    expect(done.board.length).toBe(ROWS);
    expect(done.active).not.toBeNull();
    expect(done.events).toEqual([{ type: "spawn" }]);
  });

  it("ignores player actions while clearing", () => {
    const clearing = tick(iOnNineWideStack(["XXXXXXXXX."]), LOCK_DELAY_MS);
    const quietClearing = tick(clearing, 1);
    expect(reduce(quietClearing, { type: "shift", dx: 1 })).toBe(quietClearing);
    expect(reduce(quietClearing, { type: "rotate", dir: 1 })).toBe(quietClearing);
    expect(reduce(quietClearing, { type: "hardDrop" })).toBe(quietClearing);
  });

  it("emits levelUp when crossing a level and the next gravity step uses the new speed", () => {
    const nearLevel = { ...iOnNineWideStack(["XXXXXXXXX."]), linesCleared: 9 };
    const done = tick(tick(nearLevel, LOCK_DELAY_MS), CLEAR_ANIMATION_MS);

    expect(done.linesCleared).toBe(10);
    expect(done.events).toEqual([{ type: "levelUp", level: 1 }, { type: "spawn" }]);

    const row = activeOf(done).row;
    expect(activeOf(tick(done, gravityMs(1) - 1)).row).toBe(row);
    expect(activeOf(tick(done, gravityMs(1))).row).toBe(row + 1);
  });
});

describe("pause, resume, restart", () => {
  it("freezes time and ignores player actions while paused, then resumes with the same timers", () => {
    const playing = tick(startGame(1), 300);
    const paused = reduce(playing, { type: "pause" });
    expect(paused.phase).toBe("paused");

    const later = tick(paused, 5000);
    expect(later.gravityAcc).toBe(300);
    expect(later.active).toBe(playing.active);
    expect(reduce(later, { type: "shift", dx: 1 }).active).toBe(playing.active);
    expect(reduce(later, { type: "hardDrop" }).board).toBe(playing.board);

    const resumed = reduce(later, { type: "resume" });
    expect(resumed.phase).toBe("playing");
    expect(resumed.gravityAcc).toBe(300);
    expect(activeOf(tick(resumed, gravityMs(0) - 300)).row).toBe(activeOf(playing).row + 1);
  });

  it("resumes into clearing when paused during a clear", () => {
    const grounded = withActive(withBoard(startGame(1), boardFrom(["XXXXXXXXX."])), {
      kind: "I",
      rotation: 1,
      row: 18,
      col: 7,
    });
    const clearing = tick(tick(grounded, LOCK_DELAY_MS), 50);
    const paused = reduce(clearing, { type: "pause" });
    expect(paused.phase).toBe("paused");
    expect(tick(paused, 1000).clearing?.elapsed).toBe(50);

    const resumed = reduce(paused, { type: "resume" });
    expect(resumed.phase).toBe("clearing");
    expect(tick(resumed, CLEAR_ANIMATION_MS - 50).phase).toBe("playing");
  });

  it("ignores pause and resume in ready and over", () => {
    const ready = createGame(1);
    expect(reduce(ready, { type: "pause" })).toBe(ready);
    expect(reduce(ready, { type: "resume" })).toBe(ready);

    const over = { ...tick(startGame(1), 1), phase: "over" as const, active: null };
    expect(reduce(over, { type: "pause" })).toBe(over);
    expect(reduce(over, { type: "resume" })).toBe(over);
  });

  it("restart yields a fresh game in the playing phase with a spawned piece", () => {
    const messy = { ...tick(startGame(1), 1), linesCleared: 17 };
    const paused = reduce(messy, { type: "pause" });

    const fresh = reduce(paused, { type: "restart", seed: 9 });

    expect(fresh.phase).toBe("playing");
    expect(fresh.linesCleared).toBe(0);
    expect(countFilled(fresh.board)).toBe(0);
    expect(fresh.active).toEqual(startGame(9).active);
    expect(fresh.events).toEqual([{ type: "spawn" }]);
  });

  it("restart from game over works and picks a new seed when none is given", () => {
    const over = { ...tick(startGame(1), 1), phase: "over" as const, active: null };
    const fresh = reduce(over, { type: "restart" });
    expect(fresh.phase).toBe("playing");
    expect(fresh.active).not.toBeNull();
    expect(fresh.selector).not.toEqual(over.selector);
  });
});

describe("reduce", () => {
  it("refuses an action no branch handles instead of ignoring it", () => {
    const action = { type: "teleport" } as unknown as Action;
    expect(() => reduce(startGame(1), action)).toThrow(/teleport/);
  });
});

describe("piece supply", () => {
  it("starts from the supply the game was created with", () => {
    expect(createGame(1).selector.classic).toBe(false);
    expect(createGame(1, true).selector.classic).toBe(true);
  });

  it("switches supply without disturbing the game", () => {
    const state = startGame(1);
    const switched = reduce(state, { type: "setClassic", on: true });

    expect(switched.selector.classic).toBe(true);
    expect(switched.board).toBe(state.board);
    expect(switched.active).toBe(state.active);
    expect(switched.events).toHaveLength(0);
  });

  it("does nothing at all when the supply is already the one asked for", () => {
    // Already quiet, so a reducer with nothing to do can hand back the state itself.
    const settled = { ...startGame(1), events: NO_EVENTS };
    expect(reduce(settled, { type: "setClassic", on: false })).toBe(settled);
  });

  it("draws the next piece from a shuffled bag once the supply is classic", () => {
    const classic = reduce(startGame(1), { type: "setClassic", on: true });
    expect(classic.selector.queue).toHaveLength(0);

    // One bag is shuffled on the first draw, and the piece dealt leaves six.
    expect(reduce(classic, { type: "hardDrop" }).selector.queue).toHaveLength(6);
  });

  it("leaves the bag untouched while the supply is helpful", () => {
    expect(reduce(startGame(1), { type: "hardDrop" }).selector.queue).toHaveLength(0);
  });

  it("keeps the supply across a restart, which throws away the game and not the choice", () => {
    const classic = reduce(startGame(1), { type: "setClassic", on: true });
    const restarted = reduce(classic, { type: "restart" });

    expect(restarted.selector.classic).toBe(true);
    expect(restarted.linesCleared).toBe(0);
  });
});

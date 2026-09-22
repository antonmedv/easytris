import { describe, expect, it } from "vitest";

import {
  COLS,
  CRITICAL_HEIGHT,
  DANGER_COLUMNS,
  DANGER_EXIT,
  DANGER_HEIGHT,
  DIG_PATIENCE,
} from "./config.ts";
import { nextDigAge, readBoard } from "./intent.ts";
import { boardFrom } from "./testing.ts";
import type { Intent } from "./types.ts";

const read = (rows: readonly string[], prior: Intent = "build", digAge = 0) =>
  readBoard(boardFrom(rows), prior, digAge);

describe("readBoard", () => {
  it("reads an untouched board as building", () => {
    expect(read([])).toEqual({ intent: "build", wellCol: null });
  });

  it("finds the column the player is digging", () => {
    expect(read(["XXXXXXXXX.", "XXXXXXXXX."]).wellCol).toBe(9);
  });

  it("refuses to pick between two depressions", () => {
    // A jagged surface is not a plan, so there is no dig to protect.
    expect(read(["X.XXXXX.XX", "X.XXXXX.XX", "X.XXXXX.XX"])).toEqual({
      intent: "build",
      wellCol: null,
    });
  });

  it("lets a clear leader beat a shallower dent", () => {
    // Column 1 is a routine two-deep dent; column 8 is a five-deep shaft.
    // Calling that ambiguous cancels real digs on 6.4% of spawns.
    const leader = [
      "X.XXXXXX.X",
      "X.XXXXXX.X",
      "XXXXXXXX.X",
      "XXXXXXXX.X",
      "XXXXXXXX.X",
      "XXXXXXXXXX",
      "XXXXXXXXXX",
    ];
    expect(read(leader).wellCol).toBe(8);
  });

  it("still refuses when the two are close enough to be a toss-up", () => {
    // Four deep against three: a lead of one is not a plan the selector can read.
    const rivals = ["X.XXXXXX.X", "X.XXXXXX.X", "X.XXXXXX.X", "X.XXXXXXXX", "XXXXXXXXXX"];
    expect(read(rivals).wellCol).toBeNull();
  });

  it("reads a ready well as ready", () => {
    expect(read(["XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX."]).intent).toBe(
      "tetrisReady",
    );
  });

  it("does not call a deep well ready when its floor rows are incomplete", () => {
    // The four rows that matter are the ones an I would fill -- the lowest open
    // ones. Here the upper rows are complete and the floor row is bare, so the
    // piece would land at the bottom and clear nothing.
    // Only one hole, so the dig is still worth protecting -- the point here is
    // purely that a complete upper stack does not make the well ready.
    expect(
      read(["XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXX.."]).intent,
    ).toBe("tetrisForming");
  });

  it("keeps a deep unfinished dig in tetrisForming rather than dropping it through", () => {
    // The well is four deep and the board holds two holes, which would otherwise
    // read as repair -- where single clears pay, and the selector would start
    // dismantling the dig at its most valuable moment.
    const digging = ["XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX.", "X..XXXXXX."];
    expect(read(digging).intent).toBe("tetrisForming");
  });

  it("does not mistake a shaft over dead space for a dig", () => {
    // Column 2 looks like a two-deep well, but the cells under its lid can never
    // be filled. An I dropped in lands on top and the rows below stay dead, so
    // reading this as a dig would withhold the I and penalise the clears that
    // are the only way back out.
    const shaft = ["XX.XXXXXXX", "XXXXXXXXXX", "XX.XXXXXXX", "XX.XXXXXXX"];
    const reading = read(shaft);
    expect(reading.wellCol).toBeNull();
    expect(reading.intent).toBe("repair");
  });

  it("abandons a dig once the board is carrying real damage", () => {
    // A couple of holes must not derail a committed dig, but a board this badly
    // broken needs excavating far more than it needs a tetris.
    const light = ["XXXXXXXXX.", "XXXXXXXXX.", "X..XXXXXXX", "XXXXXXXXXX"];
    expect(read(light).intent).toBe("tetrisForming");
    const heavy = ["XXXXXXXXX.", "XXXXXXXXX.", "X......XXX", "XXXXXXXXXX"];
    expect(read(heavy).intent).toBe("repair");
  });

  it("gives up on a dig that has gone nowhere for long enough", () => {
    const digging = ["XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX.", "X..XXXXXX."];
    expect(read(digging, "tetrisForming", DIG_PATIENCE - 1).intent).toBe("tetrisForming");
    expect(read(digging, "tetrisForming", DIG_PATIENCE).intent).toBe("repair");
  });

  it("repairs a board with holes", () => {
    expect(read(["XXXXXXXXXX", "X..XXXXXXX"]).intent).toBe("repair");
  });

  it("repairs a rough surface", () => {
    expect(read(["X.X.X.X.X.", "X.X.X.X.X."]).intent).toBe("repair");
  });
});

/** A picture row with the leftmost `filled` columns solid. */
const rowOf = (filled: number) => "X".repeat(filled) + ".".repeat(COLS - filled);

describe("readBoard danger", () => {
  it("does not panic over a single tall column", () => {
    // Breadth is danger; one spike short of fatal is a repair job.
    expect(read(Array(CRITICAL_HEIGHT - 1).fill(rowOf(1))).intent).toBe("repair");
  });

  it("panics when enough columns are high", () => {
    expect(read(Array(DANGER_HEIGHT).fill(rowOf(DANGER_COLUMNS))).intent).toBe("survive");
  });

  it("does not panic when too few columns are high", () => {
    expect(read(Array(DANGER_HEIGHT).fill(rowOf(DANGER_COLUMNS - 1))).intent).not.toBe("survive");
  });

  it("panics over one column that is nearly fatal", () => {
    expect(read(Array(CRITICAL_HEIGHT).fill(rowOf(1))).intent).toBe("survive");
  });

  it("holds survival until the stack is properly clear", () => {
    // Between the exit and the trigger the intent must not flip back and forth
    // on alternating spawns, so it keeps whatever it had.
    const between = Array(DANGER_EXIT + 1).fill(rowOf(COLS));
    expect(read(between, "survive").intent).toBe("survive");
    expect(read(between, "build").intent).toBe("build");
  });

  it("releases survival once the stack is low enough", () => {
    expect(read(Array(DANGER_EXIT - 1).fill(rowOf(COLS)), "survive").intent).toBe("build");
  });
});

describe("nextDigAge", () => {
  it("ages a well the board is still carrying, dug or not", () => {
    expect(nextDigAge({ intent: "tetrisForming", wellCol: 9 }, 3)).toBe(4);
    // A dig interrupted by a spell of repair is still the same dig, still ageing.
    expect(nextDigAge({ intent: "repair", wellCol: 9 }, 3)).toBe(4);
  });

  it("forgets a well that has gone or has paid out", () => {
    expect(nextDigAge({ intent: "build", wellCol: null }, 7)).toBe(0);
    expect(nextDigAge({ intent: "tetrisReady", wellCol: 9 }, 7)).toBe(0);
  });

  it("abandons a stalled dig for good, not for one spawn in eleven", () => {
    // Each reading fed back in as the next spawn's prior, the way the selector
    // does it. Asserting the boundary alone passes either way: what it cannot
    // see is the spawn after the boundary, which used to restart the dig.
    const stalled = ["XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX."];
    let intent: Intent = "build";
    let digAge = 0;
    const digging: boolean[] = [];
    for (let spawn = 0; spawn < DIG_PATIENCE * 3; spawn++) {
      const reading = read(stalled, intent, digAge);
      digging.push(reading.intent === "tetrisForming");
      intent = reading.intent;
      digAge = nextDigAge(reading, digAge);
    }
    expect(digging.slice(0, DIG_PATIENCE)).toEqual(Array(DIG_PATIENCE).fill(true));
    expect(digging.slice(DIG_PATIENCE).some(Boolean)).toBe(false);
  });
});

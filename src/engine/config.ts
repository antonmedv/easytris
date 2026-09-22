/**
 * Every gameplay and gesture tunable in one place. Change them here, never inline.
 */

import type { Intent, Kind, Weights } from "./types.ts";

// Board ------------------------------------------------------------------------

export const COLS = 10;
export const VISIBLE_ROWS = 20;
/** Hidden rows above the visible board where pieces may spawn or kick into. */
export const BUFFER_ROWS = 2;
export const ROWS = VISIBLE_ROWS + BUFFER_ROWS;

// Keyboard ---------------------------------------------------------------------

/** Delay before a held direction starts repeating. Lower feels twitchier. */
export const DAS_MS = 170;
/** Interval between repeated shifts while held. Lower slides faster. */
export const ARR_MS = 50;

// Falling ----------------------------------------------------------------------

/** Fall interval while soft dropping. Lower makes soft drop feel heavier. */
export const SOFT_DROP_MS = 50;
/** How long a grounded piece waits before locking. Higher is more forgiving. */
export const LOCK_DELAY_MS = 500;
/** How many moves may restart the lock delay before it stops resetting. */
export const LOCK_RESET_LIMIT = 15;
/** Level 0 fall interval. The game starts this slow. */
export const GRAVITY_BASE_MS = 1000;
/** Per-level multiplier on the fall interval. Closer to 1 ramps more gently. */
export const GRAVITY_FACTOR = 0.88;
/** Fastest fall interval the game ever reaches. */
export const GRAVITY_FLOOR_MS = 200;
export const LINES_PER_LEVEL = 10;
/** Pause between a lock that clears rows and the next spawn. */
export const CLEAR_ANIMATION_MS = 200;
/** Longest frame the loop will simulate, so a stalled tab does not slam pieces down. */
export const MAX_FRAME_DT_MS = 100;

// Touch ------------------------------------------------------------------------

/** Longest touch that still counts as a tap (rotate). */
export const TAP_MAX_MS = 250;
/** Movement, in cells, before a touch becomes a drag. Larger makes taps easier. */
export const DEAD_ZONE_CELLS = 0.25;
/** Floor for the dead zone in pixels so tiny cells stay tappable. */
export const DEAD_ZONE_MIN_PX = 6;
/** Release speed, in cells per millisecond, that turns a drag into a hard drop. */
export const FLICK_VELOCITY = 2 / 100;
/** Window before release over which flick velocity is measured. */
export const FLICK_WINDOW_MS = 80;
/** Minimum downward travel, in cells, for a flick to count. */
export const FLICK_MIN_TRAVEL = 0.5;
/**
 * How long a held pointer may go unheard before the next touch may take it
 * over. Only a finger that is not moving at all ever reaches this; one the
 * browser dropped without a pointerup never moves again.
 */
export const STALE_POINTER_MS = 1000;

// Selection --------------------------------------------------------------------

/**
 * Softmax temperature over the seven scored kinds. This one number is the whole
 * feel of the game: lower approaches always handing over the best piece, higher
 * approaches a uniform random bag. 0.25 gives roughly 55:1 odds between the best
 * and worst kind.
 */
export const TEMPERATURE = 0.25;
/**
 * Per-intent multiplier on that temperature.
 *
 * Under most intents the seven kinds are genuinely being compared. A dig is the
 * exception: with the I held back, the six that remain are close substitutes --
 * anything that stacks flat without disturbing the well does the job -- so
 * sharpening between them buys nothing real and costs the variety that keeps the
 * hand invisible. Left at 1, the O takes 46% of every dig, which a player would
 * read. At 2.4 the dig's spread of kinds clears the fair-share band in
 * properties.test.ts with room to spare, at a cost of well under one line per game.
 */
export const INTENT_HEAT: Readonly<Record<Intent, number>> = {
  build: 1,
  tetrisReady: 1,
  tetrisForming: 2.4,
  repair: 1,
  survive: 1,
};
/** Share of a kind's score taken from its best placement rather than its typical one. */
export const FORGIVENESS = 0.6;
/**
 * Floor on the normalisation divisor. Not a divide-by-zero guard: when the seven
 * kinds are genuinely near-equivalent, dividing by a tiny real spread would
 * rescale rounding-level differences across the full range and pick almost
 * deterministically. Read it as "scores closer together than this are tied".
 */
export const MIN_SPREAD = 50;
/**
 * How hard a decisive leader sharpens the draw.
 *
 * A flat temperature treats "these two are about equal" and "this one is the
 * only piece that works" as the same kind of choice, and fumbles the second.
 * Scaling the temperature by the leader's margin keeps the draw unpredictable
 * where the decision is close and lets it commit where it is not.
 *
 * Higher values keep sharpening the obvious calls but drag the whole mix with
 * them: at 3 the commonest kind passes a quarter of all pieces. 0 restores a
 * flat temperature.
 */
export const DECISIVE_GAIN = 1;
/**
 * Nudge given to a starved kind, in normalised units. Raise it to flatten the mix.
 *
 * Fires only for a kind unseen in STARVE_LIMIT spawns, so it lifts the floor
 * without blunting the choice anywhere else. Raising the temperature instead
 * reaches the same floor only by making every draw vaguer, and costs about a
 * third of the assistance to get there.
 */
export const STARVE_BONUS = 0.75;
/** Spawns a kind may go unseen before it is nudged back in. */
export const STARVE_LIMIT = 12;
/** Consecutive deliveries of one kind before it is excluded outright. */
export const MAX_REPEAT = 3;
/** Bumpiness above which the surface counts as needing repair. */
export const ROUGH_THRESHOLD = 12;
/** Holes tolerated before repair takes over. Above 1, so one mistake does not
 * make repair permanent and retire the build intent for the rest of the game. */
export const REPAIR_HOLES = 2;
/** Column height that counts as dangerous when enough columns reach it. */
export const DANGER_HEIGHT = 15;
/** Dangerous columns needed to trigger survival. Danger is breadth, not one spike. */
export const DANGER_COLUMNS = 4;
/** A single column this tall is fatal on its own. */
export const CRITICAL_HEIGHT = 18;
/** Survival holds until the stack falls below this, so the intent cannot oscillate. */
export const DANGER_EXIT = 12;
/**
 * Holes a board may carry and still have its dig protected.
 *
 * A couple of stray holes should not derail a well the player has committed to,
 * which is why this is not simply REPAIR_HOLES. But past a handful the board
 * needs excavating far more than it needs a tetris, and protecting the dig means
 * withholding the clears that would dig it out.
 */
export const DIG_HOLE_TOLERANCE = 4;
/** Spawns a dig is protected before it is treated as abandoned. */
export const DIG_PATIENCE = 10;
/** Depth at which a depression counts as a well worth protecting. */
export const WELL_MIN_DEPTH = 2;
/**
 * How much deeper the leading shaft must be before it is clearly the dig.
 *
 * Two comparable shafts are a board the selector should not guess about, but a
 * six-deep shaft next to a routine two-deep dent is not that board. Without this
 * lead, WELL_MIN_DEPTH would have to answer both "is this a well?" and "is this
 * ambiguous?", and one dent past the threshold would cancel a dig of any depth.
 */
export const WELL_LEAD = 2;
/** Depth at which a well can take an I piece for four rows at once. */
export const TETRIS_WELL_DEPTH = 4;
/** Restores the plain 7-bag shuffle, for comparison and for bisecting regressions. */
export const CLASSIC_BAG = false;

/**
 * How strongly the I is held back while a well is still being dug, in the same
 * normalised units as STARVE_BONUS.
 *
 * Penalising clears is not enough on its own. The I is the flattest piece there
 * is, so laying it harmlessly across the stack outscores every other kind even
 * when it clears nothing, and the selector would hand it over mid-dig for want of
 * a reason not to. What a one-placement search cannot see is option value: the I
 * is the only piece that empties a four-deep well, and spending it flat throws
 * away the one key that fits the lock. This term is that missing cost.
 *
 * Normalised rather than raw for the reason STARVE_BONUS is: in raw points it
 * would join the scores the spread is measured over and set the divisor for all
 * seven kinds, so one knob would be moving two things.
 */
export const HOARD_I = 1.6;

/**
 * Per-kind adjustments that board features cannot express, in normalised units,
 * applied once to a kind rather than to any single placement. Deliberately
 * near-empty: a bias is an admission that the evaluator cannot see something, so
 * each one needs a reason of its own.
 */
export const KIND_BIAS: Readonly<Record<Intent, Partial<Record<Kind, number>>>> = {
  build: {},
  tetrisReady: {},
  tetrisForming: { I: -HOARD_I },
  repair: {},
  survive: {},
};

/**
 * What each intent considers a good board. The negative clear values under
 * tetrisForming are what suppress the I piece during a dig: mid-dig the competing
 * option is a double or triple that would spend the I for a fraction of its value
 * and collapse rows the player is assembling.
 */
export const WEIGHTS: Readonly<Record<Intent, Weights>> = {
  build: {
    clear: [0, 10, 30, 60, 400],
    holes: -80,
    bumpiness: -6,
    aggregateHeight: -2,
    maxHeight: -4,
    wellKept: 20,
  },
  tetrisReady: {
    clear: [0, -40, -20, 0, 900],
    holes: -100,
    bumpiness: -8,
    aggregateHeight: -2,
    maxHeight: -4,
    wellKept: 40,
  },
  tetrisForming: {
    clear: [0, -60, -30, -10, 400],
    holes: -120,
    bumpiness: -14,
    aggregateHeight: -2,
    maxHeight: -4,
    wellKept: 60,
  },
  repair: {
    clear: [0, 20, 50, 90, 400],
    holes: -160,
    bumpiness: -12,
    aggregateHeight: -2,
    maxHeight: -6,
    wellKept: 20,
  },
  survive: {
    clear: [0, 120, 260, 400, 600],
    holes: -60,
    bumpiness: -4,
    aggregateHeight: -10,
    maxHeight: -30,
    wellKept: 0,
  },
};

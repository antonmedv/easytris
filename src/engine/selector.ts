import { spawnPiece } from "./board.ts";
import {
  CLASSIC_BAG,
  DECISIVE_GAIN,
  FORGIVENESS,
  INTENT_HEAT,
  KIND_BIAS,
  MAX_REPEAT,
  MIN_SPREAD,
  STARVE_BONUS,
  STARVE_LIMIT,
  TEMPERATURE,
  WEIGHTS,
} from "./config.ts";
import { scorePlacement } from "./evaluate.ts";
import { nextDigAge, readBoard } from "./intent.ts";
import { placementsOf } from "./placements.ts";
import { nextRandom } from "./rng.ts";
import { KINDS } from "./tetrominoes.ts";
import type { Board, Kind, SelectorState, Weights } from "./types.ts";

export function createSelector(seed: number, classic: boolean = CLASSIC_BAG): SelectorState {
  return { rng: seed >>> 0, recent: [], intent: "build", digAge: 0, queue: [], classic };
}

/** How many of the most recent spawns in a row were this kind. */
function runLength(recent: readonly Kind[], kind: Kind): number {
  let length = 0;
  while (length < recent.length && recent[length] === kind) length++;
  return length;
}

/**
 * Blends the kind's ceiling with what it is typically worth, because a kind whose
 * one good placement is a needle threaded at column 7 in rotation 3 is worth less
 * to a real player than a kind with several decent options. "Typically" is the
 * better half of its placements rather than its best few: a kind's top placements
 * are usually one rotation at neighbouring columns, so averaging those would just
 * restate the ceiling instead of measuring how an ordinary drop fares.
 */
function scoreKind(
  board: Board,
  kind: Kind,
  weights: Weights,
  wellCol: number | null,
): number | null {
  const placements = placementsOf(board, kind);
  if (placements.length === 0) return null;
  const scores = placements
    .map((piece) => scorePlacement(board, piece, weights, wellCol))
    .sort((left, right) => right - left);
  const half = Math.ceil(scores.length / 2);
  let sum = 0;
  for (let i = 0; i < half; i++) sum += scores[i];
  return FORGIVENESS * scores[0] + (1 - FORGIVENESS) * (sum / half);
}

type Candidate = {
  readonly kind: Kind;
  readonly score: number;
  /** The kind's standing bias, already in normalised units. */
  readonly bias: number;
};

/**
 * Draws from the candidates, weighted toward the good ones.
 *
 * The spread is floored at MIN_SPREAD rather than at an epsilon. Dividing by a
 * true spread would rescale rounding-level differences across the whole range
 * whenever the seven kinds are near-equivalent, so the flattest boards -- where
 * the choice matters least -- would be the most rigidly decided.
 *
 * The starvation nudge and the per-kind bias both land after normalisation, in
 * the same units, so each is worth the same on a quiet board as on one where a
 * tetris is a piece away. Added beforehand they would swamp the former and
 * vanish into the latter -- and, being part of the scores the spread is measured
 * over, would set the divisor for every other kind as well as their own.
 *
 * The temperature then scales with how far the leader is clear of the runner-up.
 * Randomness belongs where the decision is close; where one kind takes a clean
 * double and the rest only make the board worse, handing over anything else is
 * not variety, it is a fumble.
 */
function draw(
  candidates: readonly Candidate[],
  recent: readonly Kind[],
  heat: number,
  rng: number,
): [Kind, number] {
  const scores = candidates.map((candidate) => candidate.score);
  const best = Math.max(...scores);
  const spread = Math.max(MIN_SPREAD, best - Math.min(...scores));
  const zs = candidates.map((candidate) => {
    const z = (candidate.score - best) / spread;
    return z + candidate.bias + (recent.includes(candidate.kind) ? 0 : STARVE_BONUS);
  });
  const ranked = [...zs].sort((left, right) => right - left);
  const lead = ranked.length > 1 ? ranked[0] - ranked[1] : 1;
  const temperature = (TEMPERATURE * heat) / (1 + DECISIVE_GAIN * lead);
  const weights = zs.map((z) => Math.exp(z / temperature));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const [roll, next] = nextRandom(rng);
  let remaining = roll * total;
  for (let i = 0; i < candidates.length; i++) {
    remaining -= weights[i];
    if (remaining <= 0) return [candidates[i].kind, next];
  }
  return [candidates[candidates.length - 1].kind, next];
}

/** The plain 7-bag: a fresh shuffle of all seven whenever the queue runs dry. */
function classicNext(selector: SelectorState): [Kind, SelectorState] {
  let { queue, rng } = selector;
  if (queue.length === 0) {
    const kinds = [...KINDS];
    for (let i = kinds.length - 1; i > 0; i--) {
      const [value, next] = nextRandom(rng);
      rng = next;
      const j = Math.floor(value * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    queue = kinds;
  }
  const [kind, ...rest] = queue;
  return [kind, { ...selector, queue: rest, rng }];
}

/** Picks the piece the player most wants next. */
export function nextKind(board: Board, selector: SelectorState): [Kind, SelectorState] {
  if (selector.classic) return classicNext(selector);

  const reading = readBoard(board, selector.intent, selector.digAge);
  const { intent, wellCol } = reading;
  const bias = KIND_BIAS[intent];
  const placeable: Candidate[] = [];
  for (const kind of KINDS) {
    // The reducer spawns in one rotation at one column, so "it has somewhere to
    // rest" is not the same question as "it can get there". Scoring the first
    // while the reducer asks the second ends games it need not.
    if (spawnPiece(board, kind) === null) continue;
    const score = scoreKind(board, kind, WEIGHTS[intent], wellCol);
    if (score === null) continue;
    placeable.push({ kind, score, bias: bias[kind] ?? 0 });
  }

  // The repeat cap is a preference, not something that may deadlock. Near the
  // ceiling the spawn gate can leave a single kind standing, and excluding it
  // for having just arrived would leave nothing to choose from.
  const capped = placeable.filter(
    (candidate) => runLength(selector.recent, candidate.kind) < MAX_REPEAT,
  );
  const candidates = capped.length > 0 ? capped : placeable;

  // No kind can enter: the stack has reached the spawn columns and the next
  // piece blocks out whatever it is. Any kind will do, and the game ends on it.
  const [kind, rng] =
    candidates.length > 0
      ? draw(candidates, selector.recent, INTENT_HEAT[intent], selector.rng)
      : [KINDS[0], nextRandom(selector.rng)[1]];
  return [
    kind,
    {
      rng,
      recent: [kind, ...selector.recent].slice(0, STARVE_LIMIT),
      intent,
      digAge: nextDigAge(reading, selector.digAge),
      queue: selector.queue,
      classic: selector.classic,
    },
  ];
}

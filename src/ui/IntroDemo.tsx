import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import { KINDS, offsetsOf } from "../engine/tetrominoes.ts";
import type { Kind } from "../engine/types.ts";

import "./IntroDemo.css";
import { useReducedMotion } from "./useMediaQuery.ts";

/**
 * The bottom of a board mid-game, tiled out of real tetrominoes so every clump
 * is a piece that could actually have landed there. The empty column is dug
 * four deep, and every kind but the I is in the stack: the only cyan in the
 * sketch is the piece the game sends.
 */
const STACK: readonly string[] = ["TZZJJJ.LLL", "TTZZSJ.LOO", "TSSTSS.JOO", "SSTTTS.JJJ"];

/** The dug column, and the one kind that fills it. */
const WELL_COL = STACK[0].indexOf(".");
const CHOSEN: Kind = "I";

const COLS = STACK[0].length;
/** The stack, plus headroom for the piece to fall through. */
const ROWS = STACK.length + 3;
const STACK_TOP = ROWS - STACK.length;

type Beat = "read" | "pick" | "send";

type BeatSpec = {
  readonly id: Beat;
  readonly ms: number;
  readonly line: string;
};

/**
 * One turn of the loop, in the three beats the game itself takes: look at the
 * board, score the seven kinds, send the one that helps. The lines are one
 * sentence cut in three, which is how a screen reader reads them back.
 */
const BEATS: readonly BeatSpec[] = [
  { id: "read", ms: 2000, line: "It reads your board," },
  { id: "pick", ms: 2400, line: "picks the piece you need," },
  { id: "send", ms: 2200, line: "and sends it down." },
];

/** Grid coordinates as custom properties; the stylesheet turns them into offsets. */
function at(x: number, y: number): CSSProperties {
  return { "--x": x, "--y": y } as CSSProperties;
}

/**
 * Shape of the sketch and length of each beat, handed to CSS so the keyframes
 * carve up the same clock this file sets, and the stack stays the only place
 * the layout is written down.
 */
const VARS: CSSProperties = {
  ...(Object.fromEntries(
    BEATS.map((beat) => [`--${beat.id}-ms`, `${beat.ms}ms`]),
  ) as CSSProperties),
  "--cols": COLS,
  "--rows": ROWS,
  "--well": WELL_COL,
  "--stack-top": STACK_TOP,
  "--depth": STACK.length,
} as CSSProperties;

/**
 * Advances the loop on a timer rather than a CSS clock, so the caption and the
 * board can never drift apart. A held frame — reduced motion, or a card on its
 * way out — is the whole story at once: the piece already in the well.
 */
function useBeat(running: boolean): Beat | "still" {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % BEATS.length);
    }, BEATS[index].ms);
    return () => window.clearTimeout(timer);
  }, [running, index]);
  return running ? BEATS[index].id : "still";
}

/** One kind at glyph scale, drawn from the offsets the real board uses. */
function Glyph({ kind, index }: { readonly kind: Kind; readonly index: number }) {
  const cells = offsetsOf(kind, 0);
  const top = Math.min(...cells.map((cell) => cell.row));
  const left = Math.min(...cells.map((cell) => cell.col));
  const width = Math.max(...cells.map((cell) => cell.col)) - left + 1;
  const height = Math.max(...cells.map((cell) => cell.row)) - top + 1;
  const chosen = kind === CHOSEN;
  return (
    <div
      className={chosen ? "intro-glyph intro-glyph--chosen" : "intro-glyph"}
      data-kind={kind}
      style={{ "--i": index, "--w": width, "--h": height } as CSSProperties}
    >
      {cells.map((cell, cellIndex) => (
        <div
          key={cellIndex}
          className="intro-glyph-cell"
          data-kind={kind}
          style={at(cell.col - left, cell.row - top)}
        />
      ))}
    </div>
  );
}

type IntroDemoProps = {
  /** False once the card is on its way out, so a hidden sketch stops ticking. */
  readonly animate?: boolean;
};

/**
 * The pitch as a picture: a dug board, the seven kinds the selector scores, and
 * the I it sends. Everything visual is `aria-hidden`; the caption below carries
 * the same meaning in words.
 */
export function IntroDemo({ animate = true }: IntroDemoProps) {
  const reducedMotion = useReducedMotion();
  const beat = useBeat(animate && !reducedMotion);

  return (
    <div className="intro" data-beat={beat} style={VARS}>
      <div className="intro-rail" aria-hidden="true">
        {KINDS.map((kind, index) => (
          <Glyph key={kind} kind={kind} index={index} />
        ))}
      </div>
      <div className="intro-board" aria-hidden="true">
        <div className="intro-field">
          <div className="intro-stack">
            {STACK.flatMap((row, y) =>
              [...row].map((kind, x) =>
                kind === "." ? null : (
                  <div
                    key={`${y}:${x}`}
                    className="intro-cell"
                    data-kind={kind}
                    style={at(x, STACK_TOP + y)}
                  />
                ),
              ),
            )}
          </div>
          <div className="intro-piece">
            {STACK.map((_, y) => (
              <div
                key={y}
                className="intro-cell"
                data-kind={CHOSEN}
                style={at(WELL_COL, STACK_TOP + y)}
              />
            ))}
          </div>
        </div>
        <div className="intro-well" />
        <div className="intro-scan" />
      </div>
      <p className="intro-caption">
        {beat === "still"
          ? BEATS.map((spec) => spec.line).join(" ")
          : BEATS.map((spec) => (
              <span key={spec.id} className="intro-line" data-line={spec.id}>
                {spec.line}
              </span>
            ))}
      </p>
    </div>
  );
}

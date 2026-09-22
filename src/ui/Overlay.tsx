import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import type { Phase } from "../engine/types.ts";
import { releaseAfterPointer } from "./focus.ts";
import { IntroDemo } from "./IntroDemo.tsx";

import "./Overlay.css";

export type InputType = "keyboard" | "touch";

type CardPhase = "ready" | "paused" | "over";

type OverlayProps = {
  readonly phase: Phase;
  readonly linesCleared: number;
  readonly inputType: InputType;
  readonly classic: boolean;
  readonly onStart: () => void;
  readonly onResume: () => void;
  readonly onRestart: () => void;
  readonly onSetClassic: (classic: boolean) => void;
};

const ANNOUNCEMENT: Readonly<Record<Phase, string>> = {
  ready: "Ready to play",
  playing: "",
  clearing: "",
  paused: "Paused",
  over: "Game over",
};

function cardPhaseOf(phase: Phase): CardPhase | null {
  return phase === "ready" || phase === "paused" || phase === "over" ? phase : null;
}

/**
 * The card phase to render. While play continues the last card stays mounted
 * with the exit class so CSS can fade it out; this follows React's pattern for
 * remembering a previous prop during render.
 */
function useShownCard(phase: Phase): { shown: CardPhase | null; exiting: boolean } {
  const current = cardPhaseOf(phase);
  const [shown, setShown] = useState<CardPhase | null>(current);
  if (current !== null && current !== shown) setShown(current);
  return { shown: current ?? shown, exiting: current === null };
}

/**
 * The one control the game has, and the only place its premise is visible.
 *
 * "Random" is what every other falling-blocks game does, so naming it next to
 * the alternative is what tells a player the pieces they have been getting were
 * chosen. It sits on all three cards deliberately: the ready card so a supply
 * chosen last time is never a silent one, and the other two because a player
 * who has just been helped -- or has just topped out -- is the one with the
 * board in mind to compare.
 */
function PieceSupply({
  classic,
  onChange,
}: {
  readonly classic: boolean;
  readonly onChange: (classic: boolean) => void;
}) {
  const option = (label: string, wants: boolean) => (
    <button
      type="button"
      className="overlay-supply-option"
      aria-pressed={classic === wants}
      onClick={(event) => {
        releaseAfterPointer(event);
        onChange(wants);
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="overlay-supply">
      <p className="overlay-supply-label" id="overlay-supply-label">
        Mode
      </p>
      <div className="overlay-supply-options" role="group" aria-labelledby="overlay-supply-label">
        {option("Helpful", false)}
        {option("Random", true)}
      </div>
    </div>
  );
}

function KeyboardHints() {
  return (
    <ul className="overlay-hints">
      <li>
        <kbd>←</kbd> <kbd>→</kbd> move · <kbd>↑</kbd> <kbd>X</kbd> <kbd>Z</kbd> rotate
      </li>
      <li>
        <kbd>↓</kbd> soft drop · <kbd>Space</kbd> hard drop
      </li>
    </ul>
  );
}

function TouchHints() {
  return (
    <ul className="overlay-hints">
      <li>Drag to move · tap to rotate</li>
      <li>Flick down to drop</li>
    </ul>
  );
}

/**
 * Sends focus into the card while it is up, and takes it back out on the way
 * down: the exiting card is aria-hidden and visually gone, so focus left inside
 * it would strand the keyboard on nothing. The ready card takes focus itself
 * rather than on its button — any key starts the game, so a ring drawn around
 * Start before the player has touched anything would only read as a mistake.
 */
function useCardFocus(
  card: RefObject<HTMLDivElement | null>,
  primary: RefObject<HTMLButtonElement | null>,
  shown: CardPhase | null,
  exiting: boolean,
): void {
  useEffect(() => {
    if (shown === null) return;
    if (!exiting) {
      if (shown === "ready") card.current?.focus();
      else primary.current?.focus();
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement && card.current?.contains(active) === true) active.blur();
  }, [card, primary, shown, exiting]);
}

export function Overlay({
  phase,
  linesCleared,
  inputType,
  classic,
  onStart,
  onResume,
  onRestart,
  onSetClassic,
}: OverlayProps) {
  const { shown, exiting } = useShownCard(phase);
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  useCardFocus(card, primary, shown, exiting);
  const live = (
    <div className="overlay-live" aria-live="polite">
      {ANNOUNCEMENT[phase]}
    </div>
  );

  if (shown === null) return live;

  return (
    <>
      {live}
      <div
        key={shown}
        ref={card}
        className={`overlay overlay--${shown}${exiting ? " overlay--exit" : ""}`}
        role="dialog"
        tabIndex={shown === "ready" ? -1 : undefined}
        // No aria-modal: focus is not trapped, and the top bar stays reachable behind the card.
        aria-hidden={exiting}
        aria-labelledby="overlay-title"
      >
        <div className="overlay-card">
          {shown === "ready" && (
            <>
              <div className="overlay-intro">
                <h1 id="overlay-title" className="overlay-title">
                  Easytris
                </h1>
                <p className="overlay-lede">Tetris that wants you to win.</p>
              </div>
              <IntroDemo animate={!exiting} />
              <PieceSupply classic={classic} onChange={onSetClassic} />
              {inputType === "touch" ? <TouchHints /> : <KeyboardHints />}
              <button type="button" ref={primary} className="overlay-button" onClick={onStart}>
                {inputType === "touch" ? "Tap to start" : "Start"}
              </button>
              {inputType === "keyboard" && <p className="overlay-note">or press any key</p>}
            </>
          )}
          {shown === "paused" && (
            <>
              <h2 id="overlay-title" className="overlay-title">
                Paused
              </h2>
              <PieceSupply classic={classic} onChange={onSetClassic} />
              <div className="overlay-actions">
                <button type="button" ref={primary} className="overlay-button" onClick={onResume}>
                  Resume
                </button>
                <button
                  type="button"
                  className="overlay-button overlay-button--secondary"
                  onClick={onRestart}
                >
                  Restart
                </button>
              </div>
            </>
          )}
          {shown === "over" && (
            <>
              <h2 id="overlay-title" className="overlay-title">
                Game over
              </h2>
              <p className="overlay-stat">
                {linesCleared} {linesCleared === 1 ? "line" : "lines"}
              </p>
              <PieceSupply classic={classic} onChange={onSetClassic} />
              <button type="button" ref={primary} className="overlay-button" onClick={onRestart}>
                Play again
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import { dropDistance } from "../engine/board.ts";
import { BUFFER_ROWS, ROWS } from "../engine/config.ts";
import { offsetsOf } from "../engine/tetrominoes.ts";
import type { Board as BoardState, GameEvent, Piece } from "../engine/types.ts";

import "./Board.css";

type BoardProps = {
  readonly board: BoardState;
  readonly active: Piece | null;
  /** Row indexes currently flashing out; styled by the clearing class. */
  readonly clearingRows?: readonly number[];
  /** Events of the latest step, for one-shot animations. */
  readonly events?: readonly GameEvent[];
  /** Changes on every spawn so a new piece never glides from the old one's place. */
  readonly pieceCount?: number;
  readonly reducedMotion?: boolean;
  /** Greys the stack out from the bottom up when the game is over. */
  readonly over?: boolean;
};

/** Grid coordinates as CSS custom properties; the stylesheet turns them into transforms. */
function at(x: number, y: number): CSSProperties {
  return { "--x": x, "--y": y } as CSSProperties;
}

/** Reads a motion duration token (e.g. "80ms") from the stylesheet, so CSS stays the source of truth. */
function motionMs(node: HTMLElement, token: string, fallback: number): number {
  const parsed = Number.parseFloat(getComputedStyle(node).getPropertyValue(token));
  return Number.isNaN(parsed) ? fallback : parsed;
}

/** A zero duration means "off". */
function animate(node: HTMLElement | null, keyframes: Keyframe[], durationMs: number): void {
  if (node === null || durationMs <= 0 || typeof node.animate !== "function") return;
  node.animate(keyframes, { duration: durationMs, easing: "ease-out" });
}

const LOCK_FLARE: Keyframe[] = [{ filter: "brightness(1.9)" }, { filter: "brightness(1)" }];
const NUDGE: Keyframe[] = [
  { transform: "translateY(0)" },
  { transform: "translateY(2px)", offset: 0.4 },
  { transform: "translateY(0)" },
];

function PieceCells({ piece, className }: { piece: Piece; className: string }) {
  return (
    <div className={`board-piece ${className}`} style={at(piece.col, piece.row - BUFFER_ROWS)}>
      {offsetsOf(piece.kind, piece.rotation).map((offset, index) => (
        <div
          key={index}
          className="board-cell board-cell--filled"
          data-kind={piece.kind}
          style={at(offset.col, offset.row)}
        />
      ))}
    </div>
  );
}

export function Board({
  board,
  active,
  clearingRows = [],
  events = [],
  pieceCount = 0,
  reducedMotion = false,
  over = false,
}: BoardProps) {
  const frame = useRef<HTMLDivElement>(null);

  // One-shot animations run outside React state so a quick re-render never cuts them short.
  useEffect(() => {
    const root = frame.current;
    if (root === null) return;
    for (const event of events) {
      if (event.type === "lock") {
        for (const cell of event.cells) {
          const selector = `[data-row-id="${board[cell.row].id}"] > .board-cell:nth-child(${cell.col + 1})`;
          animate(
            root.querySelector<HTMLElement>(selector),
            LOCK_FLARE,
            motionMs(root, "--motion-lock", 100),
          );
        }
      } else if (event.type === "hardDrop" && !reducedMotion) {
        animate(root, NUDGE, motionMs(root, "--motion-nudge", 80));
      }
    }
  }, [events, board, reducedMotion]);

  const ghostDistance = active === null ? 0 : dropDistance(board, active);
  return (
    <div
      ref={frame}
      className={over ? "board board--over" : "board"}
      role="img"
      aria-label="Game board"
    >
      <div className="board-viewport">
        {board.map((row, index) => (
          <div
            key={row.id}
            className={clearingRows.includes(index) ? "board-row board-row--clearing" : "board-row"}
            data-row-id={row.id}
            style={
              { ...at(0, index - BUFFER_ROWS), "--over-delay": ROWS - 1 - index } as CSSProperties
            }
          >
            {row.cells.map((cell, col) => (
              <div
                key={col}
                className={cell === null ? "board-cell" : "board-cell board-cell--filled"}
                data-kind={cell ?? undefined}
              />
            ))}
          </div>
        ))}
        {active !== null && ghostDistance > 0 && (
          <PieceCells
            piece={{ ...active, row: active.row + ghostDistance }}
            className="board-piece--ghost"
          />
        )}
        {active !== null && (
          <PieceCells
            key={`${pieceCount}:${active.rotation}`}
            piece={active}
            className="board-piece--active"
          />
        )}
      </div>
    </div>
  );
}

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { clearRows, createBoard } from "../engine/board.ts";
import { BUFFER_ROWS, ROWS } from "../engine/config.ts";
import { boardFrom } from "../engine/testing.ts";
import type { GameEvent, Piece } from "../engine/types.ts";
import { Board } from "./Board.tsx";

function rows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".board-row"));
}

describe("Board", () => {
  it("is an image named for assistive tech", () => {
    const { getByRole } = render(<Board board={createBoard(0).board} active={null} />);
    expect(getByRole("img", { name: /game board/i })).toBeInTheDocument();
  });

  it("renders every row, positioned so the buffer rows sit above the visible area", () => {
    const { container } = render(<Board board={createBoard(0).board} active={null} />);
    const all = rows(container);
    expect(all).toHaveLength(ROWS);
    expect(all[0].style.getPropertyValue("--y")).toBe(String(-BUFFER_ROWS));
    expect(all[BUFFER_ROWS].style.getPropertyValue("--y")).toBe("0");
    expect(all[ROWS - 1].style.getPropertyValue("--y")).toBe(String(ROWS - 1 - BUFFER_ROWS));
  });

  it("renders filled cells with their kind and leaves empty cells unmarked", () => {
    const board = boardFrom(["J....T...."]);
    const { container } = render(<Board board={board} active={null} />);
    const bottom = rows(container)[ROWS - 1];
    const cells = Array.from(bottom.querySelectorAll<HTMLElement>(".board-cell"));
    expect(cells).toHaveLength(10);
    expect(cells[0].dataset.kind).toBe("J");
    expect(cells[5].dataset.kind).toBe("T");
    expect(cells[1].dataset.kind).toBeUndefined();
    expect(cells[1].classList.contains("board-cell--filled")).toBe(false);
  });

  it("renders the active piece at its column and visible row with four cells of its kind", () => {
    const active: Piece = { kind: "T", rotation: 0, row: 5, col: 3 };
    const { container } = render(<Board board={createBoard(0).board} active={active} />);
    const piece = container.querySelector<HTMLElement>(".board-piece--active");
    expect(piece).not.toBeNull();
    expect(piece?.style.getPropertyValue("--x")).toBe("3");
    expect(piece?.style.getPropertyValue("--y")).toBe(String(5 - BUFFER_ROWS));
    const cells = piece?.querySelectorAll<HTMLElement>(".board-cell--filled") ?? [];
    expect(cells).toHaveLength(4);
    expect(Array.from(cells).every((cell) => cell.dataset.kind === "T")).toBe(true);
  });

  it("renders the ghost exactly dropDistance rows below the piece", () => {
    const active: Piece = { kind: "T", rotation: 0, row: 2, col: 3 };
    const { container } = render(<Board board={createBoard(0).board} active={active} />);
    const ghost = container.querySelector<HTMLElement>(".board-piece--ghost");
    expect(ghost).not.toBeNull();
    // The T occupies rows 2-3 and can fall until its bottom rests on row 21: 18 rows.
    expect(ghost?.style.getPropertyValue("--x")).toBe("3");
    expect(ghost?.style.getPropertyValue("--y")).toBe(String(2 + 18 - BUFFER_ROWS));
  });

  it("hides the ghost when the piece is grounded", () => {
    const grounded: Piece = { kind: "T", rotation: 0, row: ROWS - 2, col: 3 };
    const { container } = render(<Board board={createBoard(0).board} active={grounded} />);
    expect(container.querySelector(".board-piece--ghost")).toBeNull();
  });

  it("keeps surviving row elements across a line clear because rows are keyed by id", () => {
    const before = boardFrom(["I.........", "XXXXXXXXXX"]);
    const survivorId = before[ROWS - 2].id;
    const { container, rerender } = render(<Board board={before} active={null} />);
    const survivorBefore = container.querySelector(`[data-row-id="${survivorId}"]`);

    const after = clearRows(before, [ROWS - 1], ROWS).board;
    rerender(<Board board={after} active={null} />);

    const survivorAfter = container.querySelector<HTMLElement>(`[data-row-id="${survivorId}"]`);
    expect(survivorAfter).toBe(survivorBefore);
    expect(survivorAfter?.style.getPropertyValue("--y")).toBe(String(ROWS - 1 - BUFFER_ROWS));
    expect(rows(container)).toHaveLength(ROWS);
  });
});

describe("Board motion", () => {
  const empty = createBoard(0).board;
  const t: Piece = { kind: "T", rotation: 0, row: 5, col: 3 };

  it("marks exactly the rows that are clearing", () => {
    const board = boardFrom(["XXXXXXXXXX", "XXXXXXXXXX"]);
    const { container } = render(<Board board={board} active={null} clearingRows={[ROWS - 1]} />);
    const all = rows(container);
    expect(all[ROWS - 1].classList.contains("board-row--clearing")).toBe(true);
    expect(all[ROWS - 2].classList.contains("board-row--clearing")).toBe(false);
  });

  it("flares exactly the locked cells", () => {
    const animate = vi.fn<HTMLElement["animate"]>();
    Object.defineProperty(HTMLElement.prototype, "animate", { value: animate, configurable: true });
    const board = boardFrom(["....T.....", "...TTT...."]);
    const lock: GameEvent = {
      type: "lock",
      cells: [
        { row: ROWS - 2, col: 4 },
        { row: ROWS - 1, col: 3 },
        { row: ROWS - 1, col: 4 },
        { row: ROWS - 1, col: 5 },
      ],
    };

    render(<Board board={board} active={null} events={[lock]} />);

    const targets = animate.mock.contexts as HTMLElement[];
    expect(targets).toHaveLength(4);
    expect(targets.every((cell) => cell.dataset.kind === "T")).toBe(true);
    expect(new Set(targets).size).toBe(4);
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
  });

  it("nudges the board on a hard drop unless motion is reduced", () => {
    const animate = vi.fn<HTMLElement["animate"]>();
    Object.defineProperty(HTMLElement.prototype, "animate", { value: animate, configurable: true });
    const drop: GameEvent = { type: "hardDrop", distance: 5 };

    render(<Board board={empty} active={null} events={[drop]} />);
    expect(animate).toHaveBeenCalledTimes(1);

    render(<Board board={empty} active={null} events={[drop]} reducedMotion />);
    expect(animate).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
  });

  it("keeps the piece element across shifts but remounts it on rotation and on a new piece", () => {
    const { container, rerender } = render(<Board board={empty} active={t} pieceCount={1} />);
    const first = container.querySelector(".board-piece--active");

    rerender(<Board board={empty} active={{ ...t, col: 4 }} pieceCount={1} />);
    expect(container.querySelector(".board-piece--active")).toBe(first);

    rerender(<Board board={empty} active={{ ...t, col: 4, rotation: 1 }} pieceCount={1} />);
    const rotated = container.querySelector(".board-piece--active");
    expect(rotated).not.toBe(first);

    rerender(<Board board={empty} active={t} pieceCount={2} />);
    expect(container.querySelector(".board-piece--active")).not.toBe(rotated);
  });
});

describe("Board game over", () => {
  it("greys out from the bottom row up with a per-row delay", () => {
    const { container } = render(<Board board={boardFrom(["XXXX......"])} active={null} over />);
    expect(container.querySelector(".board")?.classList.contains("board--over")).toBe(true);
    const all = rows(container);
    expect(all[ROWS - 1].style.getPropertyValue("--over-delay")).toBe("0");
    expect(all[BUFFER_ROWS].style.getPropertyValue("--over-delay")).toBe(
      String(ROWS - 1 - BUFFER_ROWS),
    );
  });

  it("is a plain board while playing", () => {
    const { container } = render(<Board board={createBoard(0).board} active={null} />);
    expect(container.querySelector(".board--over")).toBeNull();
  });
});

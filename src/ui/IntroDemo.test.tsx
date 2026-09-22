import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KINDS } from "../engine/tetrominoes.ts";
import { IntroDemo } from "./IntroDemo.tsx";

/** Longer than any single beat, so one call always lands on the next one. */
const PAST_A_BEAT = 4000;

function demo(): HTMLElement | null {
  return document.querySelector(".intro");
}

function cells(selector: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(selector)];
}

function columnOf(cell: HTMLElement): string {
  return cell.style.getPropertyValue("--x");
}

/** A matchMedia that answers one query with true and everything else with false. */
function matching(query: string) {
  vi.stubGlobal("matchMedia", (asked: string) => ({
    matches: asked === query,
    media: asked,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("IntroDemo", () => {
  it("lays out the seven kinds the selector scores, and marks the one that fits", () => {
    render(<IntroDemo />);
    expect(cells(".intro-glyph")).toHaveLength(KINDS.length);
    expect(cells(".intro-glyph--chosen")).toHaveLength(1);
    expect(document.querySelector(".intro-glyph--chosen")).toHaveAttribute("data-kind", "I");
  });

  it("stacks four rows around a well one column wide and four deep", () => {
    render(<IntroDemo />);
    const stack = cells(".intro-stack .intro-cell");
    const piece = cells(".intro-piece .intro-cell");
    const rows = new Set(stack.map((cell) => cell.style.getPropertyValue("--y")));
    const wellColumns = new Set(piece.map(columnOf));

    const columns = Number(demo()?.style.getPropertyValue("--cols"));
    const well = Number([...wellColumns][0]);

    expect(rows.size).toBe(4);
    expect(piece).toHaveLength(4);
    expect(wellColumns.size).toBe(1);
    // A real column of the board, and the one column the stack leaves alone.
    expect(well).toBeGreaterThanOrEqual(0);
    expect(well).toBeLessThan(columns);
    expect(new Set(stack.map(columnOf)).size).toBe(columns - 1);
    expect(stack.map(columnOf)).not.toContain(String(well));
    expect(stack).toHaveLength(4 * (columns - 1));
  });

  it("keeps the I out of the stack, so the only cyan is the piece that arrives", () => {
    render(<IntroDemo />);
    expect(cells('.intro-stack [data-kind="I"]')).toHaveLength(0);
    expect(cells('.intro-piece [data-kind="I"]')).toHaveLength(4);
  });

  it("walks board and caption through the beats together", () => {
    vi.useFakeTimers();
    render(<IntroDemo />);

    expect(demo()).toHaveAttribute("data-beat", "read");
    act(() => void vi.advanceTimersByTime(PAST_A_BEAT));
    expect(demo()).toHaveAttribute("data-beat", "pick");
    act(() => void vi.advanceTimersByTime(PAST_A_BEAT));
    expect(demo()).toHaveAttribute("data-beat", "send");
    act(() => void vi.advanceTimersByTime(PAST_A_BEAT));
    expect(demo()).toHaveAttribute("data-beat", "read");
  });

  it("reads as one sentence whether it is running or held", () => {
    const { rerender } = render(<IntroDemo />);
    const lines = cells(".intro-line").map((line) => line.textContent);
    expect(lines.join(" ")).toBe(
      "It reads your board, picks the piece you need, and sends it down.",
    );

    rerender(<IntroDemo animate={false} />);
    expect(screen.getByText(lines.join(" "))).toBeInTheDocument();
  });

  it("holds the frame while the card is on its way out", () => {
    vi.useFakeTimers();
    render(<IntroDemo animate={false} />);
    expect(demo()).toHaveAttribute("data-beat", "still");
    act(() => void vi.advanceTimersByTime(PAST_A_BEAT * 3));
    expect(demo()).toHaveAttribute("data-beat", "still");
  });

  it("holds the frame when the OS asks for reduced motion", () => {
    matching("(prefers-reduced-motion: reduce)");
    vi.useFakeTimers();
    render(<IntroDemo />);
    act(() => void vi.advanceTimersByTime(PAST_A_BEAT));
    expect(demo()).toHaveAttribute("data-beat", "still");
  });
});

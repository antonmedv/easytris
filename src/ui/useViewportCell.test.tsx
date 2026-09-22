import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { useViewportCell } from "./useViewportCell.ts";

function Probe({ onCell }: { onCell: (cell: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cell = useViewportCell(ref);
  onCell(cell);
  return <div ref={ref} data-testid="board" />;
}

describe("useViewportCell", () => {
  it("returns the measured board width divided by 10 and re-measures on resize", () => {
    let width = 300;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ width, height: width * 2 }) as DOMRect,
    );
    const seen: number[] = [];
    render(<Probe onCell={(cell) => seen.push(cell)} />);
    expect(seen.at(-1)).toBe(30);

    width = 200;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(seen.at(-1)).toBe(20);
    vi.restoreAllMocks();
  });
});

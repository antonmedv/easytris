import { describe, expect, it } from "vitest";

import { columnsAtOrAbove, surfaceOf, wellDepths } from "./surface.ts";
import { boardFrom } from "./testing.ts";

describe("surfaceOf", () => {
  it("reads an empty board as flat, hole-free and level with the floor", () => {
    const surface = surfaceOf(boardFrom([]));
    expect(surface.heights).toEqual(Array(10).fill(0));
    expect(surface.holes).toEqual(Array(10).fill(0));
    expect(surface.totalHoles).toBe(0);
    expect(surface.bumpiness).toBe(0);
    expect(surface.maxHeight).toBe(0);
    expect(surface.aggregateHeight).toBe(0);
  });

  it("measures height from the floor to the topmost filled cell", () => {
    const surface = surfaceOf(boardFrom(["X........X", "X........X", "XXXXXXXXXX"]));
    expect(surface.heights).toEqual([3, 1, 1, 1, 1, 1, 1, 1, 1, 3]);
    expect(surface.maxHeight).toBe(3);
    expect(surface.aggregateHeight).toBe(14);
  });

  it("counts a capped gap as a hole", () => {
    const surface = surfaceOf(boardFrom(["XXXXXXXXXX", "X.XXXXXXXX"]));
    expect(surface.holes[1]).toBe(1);
    expect(surface.totalHoles).toBe(1);
  });

  it("does not count an open notch as a hole", () => {
    const surface = surfaceOf(boardFrom(["X.XXXXXXXX", "XXXXXXXXXX"]));
    expect(surface.totalHoles).toBe(0);
    expect(surface.heights[1]).toBe(1);
  });

  it("sums the steps between neighbouring columns as bumpiness", () => {
    // Heights 2,0,2,0,... across ten columns: five steps up, four down, all of size 2.
    const surface = surfaceOf(boardFrom(["X.X.X.X.X.", "X.X.X.X.X."]));
    expect(surface.bumpiness).toBe(18);
  });
});

describe("wellDepths", () => {
  it("measures an interior well against its shallower neighbour", () => {
    expect(wellDepths([5, 0, 3, 3, 3, 3, 3, 3, 3, 3])[1]).toBe(3);
  });

  it("treats the wall as infinitely high so an edge column reads as a well", () => {
    expect(wellDepths([0, 4, 4, 4, 4, 4, 4, 4, 4, 4])[0]).toBe(4);
    expect(wellDepths([4, 4, 4, 4, 4, 4, 4, 4, 4, 0])[9]).toBe(4);
  });

  it("reads a flat surface as having no wells", () => {
    expect(wellDepths(Array(10).fill(3))).toEqual(Array(10).fill(0));
  });

  it("does not report a column taller than its neighbours as a well", () => {
    expect(wellDepths([2, 2, 9, 2, 2, 2, 2, 2, 2, 2])[2]).toBe(0);
  });
});

describe("columnsAtOrAbove", () => {
  it("counts columns that have reached a height, so one spike is not a broad stack", () => {
    const spike = surfaceOf(boardFrom(["..X.......", "..X.......", "..X......."]));
    expect(columnsAtOrAbove(spike, 3)).toBe(1);
    const broad = surfaceOf(boardFrom(["XXXXX.....", "XXXXX.....", "XXXXX....."]));
    expect(columnsAtOrAbove(broad, 3)).toBe(5);
  });
});

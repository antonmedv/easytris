import { describe, expect, it } from "vitest";

import { nextRandom } from "./rng.ts";

describe("nextRandom", () => {
  it("returns a value in [0, 1) and a new state", () => {
    const [value, next] = nextRandom(12345);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
    expect(next).not.toBe(12345);
  });

  it("is a pure function of its state", () => {
    expect(nextRandom(99)).toEqual(nextRandom(99));
    const [, s1] = nextRandom(99);
    const [, s2] = nextRandom(99);
    expect(nextRandom(s1)).toEqual(nextRandom(s2));
  });
});

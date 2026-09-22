import { describe, expect, it } from "vitest";

import { gravityMs, levelOf } from "./gravity.ts";

describe("gravityMs", () => {
  it("follows the spec curve: 1000 ms at level 0, shrinking 12% per level", () => {
    expect(gravityMs(0)).toBe(1000);
    expect(gravityMs(1)).toBe(880);
    expect(gravityMs(5)).toBe(528);
    expect(gravityMs(12)).toBe(216);
  });

  it("floors at 200 ms from level 13 on", () => {
    expect(gravityMs(13)).toBe(200);
    expect(gravityMs(20)).toBe(200);
  });
});

describe("levelOf", () => {
  it("advances one level every ten lines", () => {
    expect(levelOf(0)).toBe(0);
    expect(levelOf(9)).toBe(0);
    expect(levelOf(10)).toBe(1);
    expect(levelOf(25)).toBe(2);
  });
});

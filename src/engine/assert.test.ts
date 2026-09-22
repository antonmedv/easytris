import { describe, expect, it } from "vitest";

import { assertNever } from "./assert.ts";

describe("assertNever", () => {
  it("throws, naming the variant that no branch handled", () => {
    expect(() => assertNever("teleport" as never)).toThrow(/teleport/);
  });
});

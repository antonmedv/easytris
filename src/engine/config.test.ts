import { describe, expect, it } from "vitest";

import * as config from "./config.ts";

describe("engine config", () => {
  it("exposes the board dimensions from the spec", () => {
    expect(config.COLS).toBe(10);
    expect(config.VISIBLE_ROWS).toBe(20);
    expect(config.BUFFER_ROWS).toBe(2);
    expect(config.ROWS).toBe(22);
  });

  it("matches the spec's tunable defaults", () => {
    expect(config).toMatchObject({
      DAS_MS: 170,
      ARR_MS: 50,
      SOFT_DROP_MS: 50,
      LOCK_DELAY_MS: 500,
      LOCK_RESET_LIMIT: 15,
      GRAVITY_BASE_MS: 1000,
      GRAVITY_FACTOR: 0.88,
      GRAVITY_FLOOR_MS: 200,
      LINES_PER_LEVEL: 10,
      CLEAR_ANIMATION_MS: 200,
      MAX_FRAME_DT_MS: 100,
      TAP_MAX_MS: 250,
      DEAD_ZONE_CELLS: 0.25,
      DEAD_ZONE_MIN_PX: 6,
      FLICK_VELOCITY: 2 / 100,
      FLICK_WINDOW_MS: 80,
      FLICK_MIN_TRAVEL: 0.5,
    });
  });
});

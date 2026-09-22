import { GRAVITY_BASE_MS, GRAVITY_FACTOR, GRAVITY_FLOOR_MS, LINES_PER_LEVEL } from "./config.ts";

export function gravityMs(level: number): number {
  return Math.max(GRAVITY_FLOOR_MS, Math.round(GRAVITY_BASE_MS * GRAVITY_FACTOR ** level));
}

export function levelOf(linesCleared: number): number {
  return Math.floor(linesCleared / LINES_PER_LEVEL);
}

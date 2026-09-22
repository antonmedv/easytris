/**
 * localStorage, or null wherever it cannot be had: a Safari private window
 * throws on the property itself rather than on the call, and a server render
 * has no such global at all. Everything stored here is a convenience -- a mute,
 * a preference, a game to come back to -- so losing the shelf is never fatal.
 */
export function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

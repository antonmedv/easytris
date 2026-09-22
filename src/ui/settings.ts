import { defaultStorage } from "../storage.ts";

export const CLASSIC_STORAGE_KEY = "easytris.classic";

/**
 * Preferences that outlive a game.
 *
 * The supply is kept here as well as in the game state, which carries it too.
 * The state alone is not enough: a save is dropped the moment a game ends, so
 * the choice would survive every reload except the one after a top out -- the
 * reload most likely to happen.
 */
export type Settings = {
  /** Draw from a plain shuffle instead of reading the board. */
  classic(): boolean;
  setClassic(on: boolean): void;
};

type SettingsDeps = {
  readonly storage?: Storage | null;
};

export function createSettings(deps: SettingsDeps = {}): Settings {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;

  function read(): boolean {
    try {
      return storage?.getItem(CLASSIC_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  }

  let classic = read();

  return {
    classic: () => classic,
    setClassic(on) {
      classic = on;
      try {
        storage?.setItem(CLASSIC_STORAGE_KEY, String(on));
      } catch {
        // A refused write costs the preference its memory, not its effect.
      }
    },
  };
}

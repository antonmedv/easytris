import { describe, expect, it } from "vitest";

import { CLASSIC_STORAGE_KEY, createSettings } from "./settings.ts";

function fakeStorage(initial?: string): Storage {
  const entries = new Map<string, string>();
  if (initial !== undefined) entries.set(CLASSIC_STORAGE_KEY, initial);
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => {
      entries.delete(key);
    },
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}

function throwingStorage(): Storage {
  const fail = () => {
    throw new Error("storage is unavailable");
  };
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail };
}

describe("createSettings", () => {
  it("defaults to the helpful supply", () => {
    expect(createSettings({ storage: fakeStorage() }).classic()).toBe(false);
  });

  it("reads a stored choice", () => {
    expect(createSettings({ storage: fakeStorage("true") }).classic()).toBe(true);
    expect(createSettings({ storage: fakeStorage("false") }).classic()).toBe(false);
  });

  it("treats anything else as unset rather than as truthy", () => {
    expect(createSettings({ storage: fakeStorage("yes") }).classic()).toBe(false);
    expect(createSettings({ storage: fakeStorage("1") }).classic()).toBe(false);
  });

  it("remembers a choice for the next visit", () => {
    const storage = fakeStorage();
    createSettings({ storage }).setClassic(true);

    expect(createSettings({ storage }).classic()).toBe(true);
  });

  it("answers with the new choice before anything is read back", () => {
    const settings = createSettings({ storage: fakeStorage() });
    settings.setClassic(true);
    expect(settings.classic()).toBe(true);
    settings.setClassic(false);
    expect(settings.classic()).toBe(false);
  });

  it("still takes effect where the choice cannot be stored", () => {
    for (const storage of [null, throwingStorage()]) {
      const settings = createSettings({ storage });
      expect(settings.classic()).toBe(false);
      expect(() => settings.setClassic(true)).not.toThrow();
      expect(settings.classic()).toBe(true);
    }
  });
});

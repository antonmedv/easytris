import { afterEach, describe, expect, it, vi } from "vitest";

import type { GameEvent } from "../engine/types.ts";
import { MUTE_STORAGE_KEY, createAudio } from "./audio.ts";

/** Just enough of the Web Audio API to count what gets scheduled. */
class FakeNode {
  connect = vi.fn<() => FakeNode>(() => this);
  start = vi.fn<() => void>();
  stop = vi.fn<() => void>();
  frequency = {
    value: 0,
    setValueAtTime: vi.fn<(value: number, time: number) => void>(),
    exponentialRampToValueAtTime: vi.fn<(value: number, time: number) => void>(),
  };
  gain = {
    value: 1,
    setValueAtTime: vi.fn<(value: number, time: number) => void>(),
    exponentialRampToValueAtTime: vi.fn<(value: number, time: number) => void>(),
    linearRampToValueAtTime: vi.fn<(value: number, time: number) => void>(),
  };
  type = "sine";
  buffer: unknown = null;
}

class FakeContext {
  state: "suspended" | "running" = "suspended";
  currentTime = 0;
  destination = {};
  sampleRate = 44100;
  started: FakeNode[] = [];
  resume = vi.fn<() => Promise<void>>(async () => {
    this.state = "running";
  });
  createOscillator = () => this.track(new FakeNode());
  createGain = () => new FakeNode();
  createBufferSource = () => this.track(new FakeNode());
  createBuffer = () => ({ getChannelData: () => new Float32Array(64) });

  private track(node: FakeNode): FakeNode {
    node.start = vi.fn<() => void>(() => {
      this.started.push(node);
    });
    return node;
  }
}

class MemoryStorage {
  private items = new Map<string, string>();
  getItem = (key: string) => this.items.get(key) ?? null;
  setItem = (key: string, value: string) => {
    this.items.set(key, value);
  };
}

function setup(options: { storage?: MemoryStorage | null; context?: FakeContext | null } = {}) {
  const context = options.context === undefined ? new FakeContext() : options.context;
  const storage = options.storage === undefined ? new MemoryStorage() : options.storage;
  const audio = createAudio({
    createContext: () => context as unknown as AudioContext | null,
    storage: storage as unknown as Storage | null,
  });
  return { audio, context, storage };
}

const LOCK: GameEvent = { type: "lock", cells: [] };
const CLEAR_ONE: GameEvent = { type: "clear", rows: [21] };
const CLEAR_FOUR: GameEvent = { type: "clear", rows: [18, 19, 20, 21] };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("unlock", () => {
  it("creates the context lazily and resumes it, and plays nothing before that", () => {
    const { audio, context } = setup();
    audio.play({ type: "rotate" });
    expect(context?.started).toHaveLength(0);

    audio.unlock();
    expect(context?.resume).toHaveBeenCalled();
    audio.play({ type: "rotate" });
    expect(context?.started.length).toBeGreaterThan(0);
  });
});

describe("play", () => {
  it("schedules a sound for every mapped event and nothing for shifts and spawns", () => {
    const { audio, context } = setup();
    audio.unlock();
    const counts = new Map<string, number>();
    const events: GameEvent[] = [
      { type: "rotate" },
      LOCK,
      { type: "hardDrop", distance: 5 },
      CLEAR_ONE,
      CLEAR_FOUR,
      { type: "gameOver" },
      { type: "shift" },
      { type: "spawn" },
      { type: "levelUp", level: 1 },
    ];
    for (const event of events) {
      const before = context?.started.length ?? 0;
      audio.play(event);
      counts.set(
        event.type + ("rows" in event ? event.rows.length : ""),
        (context?.started.length ?? 0) - before,
      );
    }
    expect(counts.get("rotate")).toBeGreaterThan(0);
    expect(counts.get("lock")).toBeGreaterThan(0);
    expect(counts.get("hardDrop")).toBeGreaterThan(0);
    expect(counts.get("clear1")).toBeGreaterThan(0);
    expect(counts.get("clear4")).toBeGreaterThan(counts.get("clear1") ?? 0);
    expect(counts.get("gameOver")).toBeGreaterThan(0);
    expect(counts.get("shift")).toBe(0);
    expect(counts.get("spawn")).toBe(0);
    expect(counts.get("levelUp")).toBe(0);
  });

  it("is a silent no-op while muted", () => {
    const { audio, context } = setup();
    audio.unlock();
    audio.setMuted(true);
    audio.play(LOCK);
    expect(context?.started).toHaveLength(0);
  });
});

describe("mute persistence", () => {
  it("starts unmuted, persists the toggle, and a fresh instance reads it back", () => {
    const storage = new MemoryStorage();
    const { audio } = setup({ storage });
    expect(audio.isMuted()).toBe(false);

    expect(audio.toggleMute()).toBe(true);
    expect(storage.getItem(MUTE_STORAGE_KEY)).toBe("1");

    const again = setup({ storage }).audio;
    expect(again.isMuted()).toBe(true);
    expect(again.toggleMute()).toBe(false);
    expect(storage.getItem(MUTE_STORAGE_KEY)).toBe("0");
  });

  it("survives a missing or throwing storage", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as MemoryStorage;
    const { audio } = setup({ storage: throwing });
    expect(audio.isMuted()).toBe(false);
    expect(() => audio.toggleMute()).not.toThrow();
    expect(setup({ storage: null }).audio.isMuted()).toBe(false);
  });
});

describe("without Web Audio", () => {
  it("never throws and gameplay feedback simply does nothing", () => {
    const { audio } = setup({ context: null });
    expect(() => {
      audio.unlock();
      audio.play(LOCK);
      audio.play(CLEAR_FOUR);
    }).not.toThrow();
  });

  it("uses the real AudioContext constructor by default when present, and copes when absent", () => {
    vi.stubGlobal("AudioContext", undefined);
    const audio = createAudio();
    expect(() => {
      audio.unlock();
      audio.play(LOCK);
    }).not.toThrow();
    vi.unstubAllGlobals();
  });
});

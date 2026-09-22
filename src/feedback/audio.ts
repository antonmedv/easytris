import type { GameEvent } from "../engine/types.ts";
import { defaultStorage } from "../storage.ts";

export const MUTE_STORAGE_KEY = "easytris.muted";

/** Roughly -18 dBFS: present, never startling. */
const MASTER_GAIN = 0.126;

export type Audio = {
  /** Creates or resumes the AudioContext. Call inside a user gesture. */
  unlock(): void;
  play(event: GameEvent): void;
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  toggleMute(): boolean;
};

type AudioDeps = {
  readonly createContext?: () => AudioContext | null;
  readonly storage?: Storage | null;
};

function defaultContext(): AudioContext | null {
  return typeof AudioContext === "function" ? new AudioContext() : null;
}

type Tone = {
  readonly freq: number;
  /** Frequency to glide to by the end, for thuds. */
  readonly glideTo?: number;
  readonly type?: OscillatorType;
  readonly duration: number;
  readonly gain: number;
  readonly at?: number;
};

const NOTE = { A3: 220, C4: 261.63, E4: 329.63, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5 };

export function createAudio(deps: AudioDeps = {}): Audio {
  const createContext = deps.createContext ?? defaultContext;
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = readMuted();

  function readMuted(): boolean {
    try {
      return storage?.getItem(MUTE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function writeMuted(value: boolean): void {
    try {
      storage?.setItem(MUTE_STORAGE_KEY, value ? "1" : "0");
    } catch {
      // Storage may be blocked; mute still applies for this session.
    }
  }

  function unlock(): void {
    try {
      if (context === null) {
        context = createContext();
        if (context === null) return;
        master = context.createGain();
        master.gain.value = MASTER_GAIN;
        master.connect(context.destination);
      }
      if (context.state === "suspended") void context.resume();
    } catch {
      context = null;
      master = null;
    }
  }

  function tone({ freq, glideTo, type = "sine", duration, gain, at = 0 }: Tone): void {
    if (context === null || master === null) return;
    const start = context.currentTime + at;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, start);
    if (glideTo !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
    }
    envelope.gain.setValueAtTime(gain, start);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function noise(duration: number, gain: number): void {
    if (context === null || master === null) return;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const envelope = context.createGain();
    source.buffer = buffer;
    const start = context.currentTime;
    envelope.gain.setValueAtTime(gain, start);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(envelope);
    envelope.connect(master);
    source.start(start);
  }

  function chime(rows: number): void {
    const notes = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6];
    if (rows >= 4) {
      notes.forEach((freq) => tone({ freq, type: "triangle", duration: 0.5, gain: 0.5 }));
      tone({ freq: NOTE.C6 * 2, type: "sine", duration: 0.35, gain: 0.25, at: 0.06 });
      return;
    }
    for (let i = 0; i < rows; i++) {
      tone({ freq: notes[i], type: "triangle", duration: 0.28, gain: 0.55, at: i * 0.045 });
    }
  }

  function play(event: GameEvent): void {
    if (muted || context === null) return;
    try {
      switch (event.type) {
        case "rotate":
          tone({ freq: 880, type: "square", duration: 0.03, gain: 0.12 });
          break;
        case "lock":
          tone({ freq: 160, glideTo: 90, duration: 0.06, gain: 0.5 });
          break;
        case "hardDrop":
          tone({ freq: 120, glideTo: 55, duration: 0.07, gain: 0.6 });
          noise(0.04, 0.18);
          break;
        case "clear":
          chime(event.rows.length);
          break;
        case "gameOver":
          tone({ freq: NOTE.E4, type: "triangle", duration: 0.25, gain: 0.5 });
          tone({ freq: NOTE.C4, type: "triangle", duration: 0.25, gain: 0.5, at: 0.18 });
          tone({ freq: NOTE.A3, type: "triangle", duration: 0.4, gain: 0.5, at: 0.36 });
          break;
        default:
          break;
      }
    } catch {
      // Feedback must never affect gameplay.
    }
  }

  return {
    unlock,
    play,
    isMuted: () => muted,
    setMuted(value) {
      muted = value;
      writeMuted(value);
    },
    toggleMute() {
      muted = !muted;
      writeMuted(muted);
      return muted;
    },
  };
}

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useInputType, useMediaQuery, useReducedMotion } from "./useMediaQuery.ts";

type Listener = (event: MediaQueryListEvent) => void;

/** Installs a fake matchMedia whose match state can be flipped at runtime. */
function installMatchMedia(initial: Record<string, boolean>) {
  const listeners = new Map<string, Set<Listener>>();
  const matches = { ...initial };
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return matches[query] ?? false;
    },
    media: query,
    addEventListener: (_: "change", listener: Listener) => {
      listeners.set(query, (listeners.get(query) ?? new Set()).add(listener));
    },
    removeEventListener: (_: "change", listener: Listener) => {
      listeners.get(query)?.delete(listener);
    },
  }));
  return (query: string, value: boolean) => {
    matches[query] = value;
    act(() => {
      for (const listener of listeners.get(query) ?? []) {
        listener({ matches: value } as MediaQueryListEvent);
      }
    });
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMediaQuery", () => {
  it("reflects the current match and updates when it changes", () => {
    const flip = installMatchMedia({ "(pointer: coarse)": false });
    const { result } = renderHook(() => useMediaQuery("(pointer: coarse)"));
    expect(result.current).toBe(false);
    flip("(pointer: coarse)", true);
    expect(result.current).toBe(true);
  });

  it("is false when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useMediaQuery("(prefers-reduced-motion: reduce)"));
    expect(result.current).toBe(false);
  });
});

describe("useInputType", () => {
  it("reports touch for coarse pointers and keyboard otherwise", () => {
    const flip = installMatchMedia({ "(pointer: coarse)": true });
    const { result } = renderHook(() => useInputType());
    expect(result.current).toBe("touch");
    flip("(pointer: coarse)", false);
    expect(result.current).toBe("keyboard");
  });
});

describe("useReducedMotion", () => {
  it("is true when the OS asks for reduced motion", () => {
    installMatchMedia({ "(prefers-reduced-motion: reduce)": true });
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });
});

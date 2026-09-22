import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import App from "./App.tsx";
import { CLEAR_ANIMATION_MS, ROWS, STALE_POINTER_MS } from "./engine/config.ts";
import { createGame } from "./engine/game.ts";
import { gravityMs } from "./engine/gravity.ts";
import { activeOf, countFilled, seedFor, startGame } from "./engine/testing.ts";
import type { GameEvent } from "./engine/types.ts";
import type { Audio } from "./feedback/audio.ts";
import { createGameStore } from "./ui/gameStore.ts";
import { createSettings } from "./ui/settings.ts";

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

function keyDown(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, cancelable: true, bubbles: true, ...init });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe("App", () => {
  it("renders the board", () => {
    render(<App store={createGameStore(startGame(seedFor("T")))} />);
    expect(screen.getByRole("img", { name: /game board/i })).toBeInTheDocument();
  });

  it("moves the active piece one column left on ArrowLeft and re-renders it", () => {
    const store = createGameStore(startGame(seedFor("T")));
    const { container } = render(<App store={store} />);
    const col = activeOf(store.getState()).col;

    keyDown("ArrowLeft");

    expect(activeOf(store.getState()).col).toBe(col - 1);
    const piece = container.querySelector<HTMLElement>(".board-piece--active");
    expect(piece?.style.getPropertyValue("--x")).toBe(String(col - 1));
  });

  it("hard drops on Space", () => {
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);

    keyDown(" ");

    expect(countFilled(store.getState().board)).toBe(4);
  });

  it("prevents the default for game keys and leaves other keys alone", () => {
    render(<App store={createGameStore(startGame(seedFor("T")))} />);
    expect(keyDown(" ").defaultPrevented).toBe(true);
    expect(keyDown("ArrowDown").defaultPrevented).toBe(true);
    expect(keyDown("a").defaultPrevented).toBe(false);
    fireEvent.keyUp(window, { key: "ArrowDown" });
  });

  it("leaves a browser shortcut alone, keys and all", () => {
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);
    const before = activeOf(store.getState());

    // Cmd+Left is Back, Ctrl+P is Print, Cmd+Z is Undo. All three land on keys
    // the game binds, and all three belong to the browser.
    expect(keyDown("ArrowLeft", { metaKey: true }).defaultPrevented).toBe(false);
    expect(keyDown("p", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(keyDown("z", { metaKey: true }).defaultPrevented).toBe(false);

    const after = activeOf(store.getState());
    expect(store.getState().phase).toBe("playing");
    expect(after.col).toBe(before.col);
    expect(after.rotation).toBe(before.rotation);
  });

  it("still plays a key held with Shift, which modifies nothing here", () => {
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);

    expect(keyDown("X", { shiftKey: true }).defaultPrevented).toBe(true);

    expect(activeOf(store.getState()).rotation).toBe(1);
  });

  it("lifts a direction released under a modifier, so it never repeats alone", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);

    // Pressed plainly, then released while the player reaches for a shortcut:
    // the keyup arrives with the modifier already down, and must still count.
    keyDown("ArrowLeft");
    const col = activeOf(store.getState()).col;
    fireEvent.keyUp(window, { key: "ArrowLeft", metaKey: true });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(activeOf(store.getState()).col).toBe(col);
  });

  it("starts the game on any game key while ready, without applying that key", () => {
    const store = createGameStore(createGame(seedFor("T")));
    render(<App store={store} />);

    keyDown("ArrowLeft");

    const state = store.getState();
    expect(state.phase).toBe("playing");
    expect(activeOf(state).col).toBe(3);
  });

  it("runs the frame loop so gravity moves the piece over time", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);
    const row = activeOf(store.getState()).row;

    act(() => {
      vi.advanceTimersByTime(gravityMs(0) + 100);
    });

    expect(activeOf(store.getState()).row).toBeGreaterThan(row);
  });

  it("asks for no frames at all once the game is over", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const store = createGameStore({ ...createGame(seedFor("T")), phase: "over" });
    const dispatch = vi.spyOn(store, "dispatch");
    render(<App store={store} />);
    dispatch.mockClear();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("asks for no frames while paused, and picks up again on resume", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);

    act(() => {
      store.dispatch({ type: "pause" });
    });
    const row = activeOf(store.getState()).row;
    act(() => {
      vi.advanceTimersByTime(gravityMs(0) * 3);
    });
    expect(activeOf(store.getState()).row).toBe(row);

    act(() => {
      store.dispatch({ type: "resume" });
    });
    act(() => {
      vi.advanceTimersByTime(gravityMs(0) + 100);
    });

    expect(activeOf(store.getState()).row).toBeGreaterThan(row);
  });

  it("keeps asking for frames while rows are clearing, which only a tick ends", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const store = createGameStore({
      ...startGame(seedFor("T")),
      phase: "clearing",
      active: null,
      clearing: { rows: [ROWS - 1], elapsed: 0 },
    });
    render(<App store={store} />);

    act(() => {
      vi.advanceTimersByTime(CLEAR_ANIMATION_MS + 100);
    });

    expect(store.getState().phase).toBe("playing");
  });
});

function blurWindow(): void {
  act(() => {
    window.dispatchEvent(new Event("blur"));
  });
}

describe("held keys", () => {
  it("stops auto-repeating a held direction once the window loses focus", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);

    // The player holds the key and switches away; the keyup lands in the other window.
    keyDown("ArrowLeft");
    const col = activeOf(store.getState()).col;
    blurWindow();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(activeOf(store.getState()).col).toBe(col);
  });

  it("ends a held soft drop once the window loses focus", () => {
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);

    keyDown("ArrowDown");
    expect(store.getState().softDropping).toBe(true);
    blurWindow();

    expect(store.getState().softDropping).toBe(false);
  });

  it("takes the same key again when focus comes back", () => {
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);

    keyDown("ArrowLeft");
    const col = activeOf(store.getState()).col;
    blurWindow();
    keyDown("ArrowLeft");

    expect(activeOf(store.getState()).col).toBe(col - 1);
  });
});

function setVisibility(value: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", { value, configurable: true });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("phases", () => {
  afterEach(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("shows the start overlay while ready and starts from its button", async () => {
    const store = createGameStore(createGame(seedFor("T")));
    render(<App store={store} />);
    expect(screen.getByRole("heading", { name: /easytris/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^start$/i }));
    expect(store.getState().phase).toBe("playing");
  });

  it("pauses when the tab is hidden and stays paused when it is visible again", () => {
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);

    setVisibility("hidden");
    expect(store.getState().phase).toBe("paused");
    expect(screen.getByRole("heading", { name: /paused/i })).toBeInTheDocument();

    setVisibility("visible");
    expect(store.getState().phase).toBe("paused");
  });

  it("resumes from the overlay button and from Enter", async () => {
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);

    keyDown("p");
    expect(store.getState().phase).toBe("paused");
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: /resume/i }),
    );
    expect(store.getState().phase).toBe("playing");

    keyDown("Escape");
    expect(store.getState().phase).toBe("paused");
    keyDown("Enter");
    expect(store.getState().phase).toBe("playing");
  });

  it("restarts from the game-over overlay and from Enter", async () => {
    const over = {
      ...startGame(seedFor("T")),
      phase: "over" as const,
      active: null,
      linesCleared: 4,
    };
    const store = createGameStore(over);
    render(<App store={store} />);
    expect(screen.getByText(/4 lines/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /play again/i }));
    expect(store.getState().phase).toBe("playing");
    expect(store.getState().linesCleared).toBe(0);

    store.dispatch({ type: "pause" });
    act(() => {
      store.dispatch({ type: "restart" });
    });
    expect(store.getState().phase).toBe("playing");
  });
});

describe("top bar", () => {
  it("shows lines cleared and toggles pause from its button", async () => {
    const store = createGameStore({ ...startGame(seedFor("T")), linesCleared: 7 });
    render(<App store={store} />);
    expect(within(screen.getByRole("banner")).getByText("7")).toBeInTheDocument();

    const bar = within(screen.getByRole("banner"));
    await userEvent.click(bar.getByRole("button", { name: /pause/i }));
    expect(store.getState().phase).toBe("paused");
    await userEvent.click(bar.getByRole("button", { name: /resume/i }));
    expect(store.getState().phase).toBe("playing");
  });

  it("toggles the mute state", async () => {
    render(<App store={createGameStore(startGame(seedFor("T")))} />);
    const bar = within(screen.getByRole("banner"));
    await userEvent.click(bar.getByRole("button", { name: /^mute$/i }));
    expect(bar.getByRole("button", { name: /unmute/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("activates the focused button with Enter", async () => {
    const user = userEvent.setup();
    render(<App store={createGameStore(startGame(seedFor("T")))} />);
    const mute = within(screen.getByRole("banner")).getByRole("button", { name: /^mute$/i });

    mute.focus();
    await user.keyboard("{Enter}");

    expect(mute).toHaveAccessibleName("Unmute");
  });

  it("activates the focused button with Space instead of hard dropping", async () => {
    const user = userEvent.setup();
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);

    within(screen.getByRole("banner"))
      .getByRole("button", { name: /^pause$/i })
      .focus();
    await user.keyboard(" ");

    expect(store.getState().phase).toBe("paused");
    expect(countFilled(store.getState().board)).toBe(0);
  });

  it("leaves Enter to a focused link, and keeps Space a hard drop over one", async () => {
    const user = userEvent.setup();
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);
    within(screen.getByRole("banner"))
      .getByRole("link", { name: /github/i })
      .focus();
    let prevented: boolean | null = null;
    const watch = (event: KeyboardEvent) => (prevented = event.defaultPrevented);

    window.addEventListener("keydown", watch);
    await user.keyboard("{Enter}");
    window.removeEventListener("keydown", watch);
    expect(prevented).toBe(false);

    await user.keyboard(" ");
    expect(countFilled(store.getState().board)).toBe(4);
  });

  it("still plays the game with the other keys while a button has focus", () => {
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);
    const col = activeOf(store.getState()).col;

    within(screen.getByRole("banner"))
      .getByRole("button", { name: /^mute$/i })
      .focus();
    keyDown("ArrowLeft");

    expect(activeOf(store.getState()).col).toBe(col - 1);
  });

  it("drops focus after a pointer click so Space stays a hard drop", async () => {
    const user = userEvent.setup();
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);

    await user.click(within(screen.getByRole("banner")).getByRole("button", { name: /^mute$/i }));
    expect(document.activeElement).toBe(document.body);
    await user.keyboard(" ");

    expect(countFilled(store.getState().board)).toBe(4);
  });
});

describe("touch", () => {
  it("refuses a text selection, so no loupe or copy callout lands on the board", () => {
    render(<App store={createGameStore(startGame(seedFor("T")))} />);
    const event = new Event("selectstart", { bubbles: true, cancelable: true });

    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("refuses the default of a touch on the play area, so iOS runs no gesture of its own", () => {
    render(<App store={createGameStore(startGame(seedFor("T")))} />);
    const event = new Event("touchstart", { bubbles: true, cancelable: true });

    screen.getByRole("main").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves a touch on an overlay card alone, so a card too tall to fit can scroll", () => {
    render(<App store={createGameStore(createGame(seedFor("T")))} />);
    const event = new Event("touchstart", { bubbles: true, cancelable: true });

    screen.getByRole("dialog").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves a touch on a play-area button alone, so the tap still clicks", () => {
    render(<App store={createGameStore(createGame(seedFor("T")))} />);
    const event = new Event("touchstart", { bubbles: true, cancelable: true });

    screen.getByRole("button", { name: /start/i }).dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  function mockBoardWidth(width: number): void {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ width, height: width * 2 }) as DOMRect,
    );
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("starts the game on a tap anywhere in the play area while ready", () => {
    const store = createGameStore(createGame(seedFor("T")));
    render(<App store={store} />);
    fireEvent.pointerDown(screen.getByRole("main"), {
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    expect(store.getState().phase).toBe("playing");
  });

  it("shifts the piece one column for one cell of horizontal drag", () => {
    mockBoardWidth(300);
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);
    const main = screen.getByRole("main");
    const col = activeOf(store.getState()).col;

    fireEvent.pointerDown(main, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(main, { pointerId: 1, clientX: 135, clientY: 101 });
    expect(activeOf(store.getState()).col).toBe(col + 1);

    fireEvent.pointerUp(main, { pointerId: 1, clientX: 135, clientY: 101 });
    expect(activeOf(store.getState()).col).toBe(col + 1);
  });

  it("rotates on a quick tap", () => {
    mockBoardWidth(300);
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);
    const main = screen.getByRole("main");
    fireEvent.pointerDown(main, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(main, { pointerId: 1, clientX: 101, clientY: 100 });
    expect(activeOf(store.getState()).rotation).toBe(1);
  });

  // Both of these are the same fault: a touch the browser never closed. The OS
  // took the gesture -- app switcher, notification shade, an incoming call --
  // and no pointerup or pointercancel followed. Held, that pointer made every
  // touch for the rest of the session a no-op.
  it("plays on after a touch the OS took and never closed", () => {
    mockBoardWidth(300);
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);
    const main = screen.getByRole("main");

    fireEvent.pointerDown(main, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(main, { pointerId: 1, clientX: 105, clientY: 101 });

    now = STALE_POINTER_MS + 1;
    const col = activeOf(store.getState()).col;
    fireEvent.pointerDown(main, { pointerId: 2, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(main, { pointerId: 2, clientX: 135, clientY: 101 });
    expect(activeOf(store.getState()).col).toBe(col + 1);
  });

  it("forgets a touch in progress when the page loses the window", () => {
    mockBoardWidth(300);
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);
    const main = screen.getByRole("main");

    fireEvent.pointerDown(main, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });

    const col = activeOf(store.getState()).col;
    fireEvent.pointerDown(main, { pointerId: 2, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(main, { pointerId: 2, clientX: 135, clientY: 101 });
    expect(activeOf(store.getState()).col).toBe(col + 1);
  });

  it("shows touch hints while ready on a coarse pointer", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<App store={createGameStore(createGame(seedFor("T")))} />);
    expect(screen.getByRole("button", { name: /tap to start/i })).toBeInTheDocument();
  });
});

function fakeAudio(muted = false): Audio & { play: Mock<(event: GameEvent) => void> } {
  return {
    unlock: vi.fn<() => void>(),
    play: vi.fn<(event: GameEvent) => void>(),
    isMuted: () => muted,
    setMuted: vi.fn<(value: boolean) => void>(),
    toggleMute: vi.fn<() => boolean>(() => !muted),
  };
}

describe("audio", () => {
  it("unlocks audio on the start key and plays the sounds for the events that follow", () => {
    const audio = fakeAudio();
    const store = createGameStore(createGame(seedFor("T")));
    render(<App store={store} audio={audio} />);

    keyDown("ArrowLeft");
    expect(audio.unlock).toHaveBeenCalled();

    keyDown(" ");
    const played = audio.play.mock.calls.map(([event]) => event.type);
    expect(played).toEqual(expect.arrayContaining(["hardDrop", "lock", "spawn"]));
  });

  it("reads the initial mute state from audio and toggles through it", async () => {
    const audio = fakeAudio(true);
    render(<App store={createGameStore(startGame(seedFor("T")))} audio={audio} />);
    const bar = within(screen.getByRole("banner"));
    expect(bar.getByRole("button", { name: /unmute/i })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(bar.getByRole("button", { name: /unmute/i }));
    expect(audio.toggleMute).toHaveBeenCalledTimes(1);
    expect(bar.getByRole("button", { name: /^mute$/i })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("haptics", () => {
  it("vibrates on lock where the platform supports it", () => {
    const vibrate = vi.fn<(pattern: number | number[]) => boolean>(() => true);
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);

    keyDown(" ");

    expect(vibrate).toHaveBeenCalledWith(10);
    Object.defineProperty(navigator, "vibrate", { value: undefined, configurable: true });
  });
});

describe("piece supply", () => {
  it("switches supply from the pause card and remembers the choice", async () => {
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);
    keyDown("p");

    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: /random/i }),
    );

    expect(store.getState().selector.classic).toBe(true);
    expect(createSettings().classic()).toBe(true);
    // The selector is no part of the board, so the store has to be told the
    // change is worth a render or the pill would not follow the click.
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: /random/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("chooses a supply on the ready card without starting the game", async () => {
    const store = createGameStore(createGame(seedFor("T")));
    render(<App store={store} />);

    await userEvent.click(screen.getByRole("button", { name: /random/i }));

    expect(store.getState().selector.classic).toBe(true);
    expect(store.getState().phase).toBe("ready");
  });

  it("starts a new game on the supply chosen last time", () => {
    createSettings().setClassic(true);

    render(<App />);

    expect(screen.getByRole("button", { name: /random/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps playing where it was when the supply changes", async () => {
    const store = createGameStore(startGame(seedFor("T")));
    render(<App store={store} />);
    const before = activeOf(store.getState());
    keyDown("p");

    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: /random/i }),
    );
    keyDown("Escape");

    expect(store.getState().phase).toBe("playing");
    expect(activeOf(store.getState())).toEqual(before);
  });
});

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import "./App.css";
import { createGame } from "./engine/game.ts";
import type { Action, Phase } from "./engine/types.ts";
import { createAudio } from "./feedback/audio.ts";
import type { Audio } from "./feedback/audio.ts";
import { vibrateFor } from "./feedback/haptics.ts";
import {
  createRecognizer,
  pointerCancel,
  pointerDown,
  pointerMove,
  pointerUp,
} from "./input/gestures.ts";
import type { GestureContext, PointerSample, RecognizerState } from "./input/gestures.ts";
import {
  createKeyboard,
  isGameKey,
  keyDown,
  keyUp,
  tick as keyboardTick,
} from "./input/keyboard.ts";
import type { Command, KeyboardState } from "./input/keyboard.ts";
import { Board } from "./ui/Board.tsx";
import { createGameStore } from "./ui/gameStore.ts";
import type { GameStore } from "./ui/gameStore.ts";
import { Overlay } from "./ui/Overlay.tsx";
import { createSettings } from "./ui/settings.ts";
import type { Settings } from "./ui/settings.ts";
import { TopBar } from "./ui/TopBar.tsx";
import { useGameLoop } from "./ui/useGameLoop.ts";
import { useInputType, useReducedMotion } from "./ui/useMediaQuery.ts";
import { useViewportCell } from "./ui/useViewportCell.ts";

/** Resolves the phase-dependent keyboard commands into engine actions. */
function toActions(commands: readonly Command[], phase: Phase): Action[] {
  const actions: Action[] = [];
  for (const command of commands) {
    switch (command.type) {
      case "confirm":
        if (phase === "over") actions.push({ type: "restart" });
        else if (phase === "paused") actions.push({ type: "resume" });
        break;
      case "togglePause":
        if (phase === "playing" || phase === "clearing") actions.push({ type: "pause" });
        else if (phase === "paused") actions.push({ type: "resume" });
        break;
      default:
        actions.push(command);
    }
  }
  return actions;
}

/** The button or link an event lands on, if any: a control handles its own activation. */
function controlAt(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target.closest("button, a[href]") : null;
}

/** The overlay card an event lands on, if any. A card is not the gesture surface. */
function cardAt(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target.closest("[role=dialog]") : null;
}

/**
 * Enter and Space activate a focused control. Letting the game have them too
 * would cancel the activation, so a focused button keeps them to itself; every
 * other game key still plays. A link answers to Enter alone, so Space over one
 * still drops the piece.
 */
function activatesFocusedControl(event: KeyboardEvent): boolean {
  if (event.key !== "Enter" && event.key !== " ") return false;
  const control = controlAt(event.target);
  if (control === null) return false;
  return control.tagName !== "A" || event.key === "Enter";
}

function isShortcut(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.altKey || event.metaKey;
}

function sampleOf(event: ReactPointerEvent<HTMLElement>): PointerSample {
  return { x: event.clientX, y: event.clientY, t: performance.now() };
}

type AppProps = {
  /** Injected by tests; the app creates its own otherwise. */
  readonly store?: GameStore;
  readonly audio?: Audio;
  readonly settings?: Settings;
};

function App({ store: providedStore, audio: providedAudio, settings: providedSettings }: AppProps) {
  const [settings] = useState(() => providedSettings ?? createSettings());
  // A new game takes its supply from the preference, which outlives any game.
  const [store] = useState(
    () => providedStore ?? createGameStore(createGame(Date.now() >>> 0, settings.classic())),
  );
  const [audio] = useState(() => providedAudio ?? createAudio());
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const keyboard = useRef<KeyboardState>(createKeyboard());
  const recognizer = useRef<RecognizerState>(createRecognizer());
  const playAreaRef = useRef<HTMLElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const cellPx = useViewportCell(boardRef);
  const inputType = useInputType();
  const reducedMotion = useReducedMotion();
  const [muted, setMuted] = useState(() => audio.isMuted());

  const togglePause = () => {
    const phase = store.getState().phase;
    if (phase === "playing" || phase === "clearing") store.dispatch({ type: "pause" });
    else if (phase === "paused") store.dispatch({ type: "resume" });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isShortcut(event) || !isGameKey(event.key) || activatesFocusedControl(event)) return;
      event.preventDefault();
      if (event.repeat) return;
      audio.unlock();
      const phase = store.getState().phase;
      if (phase === "ready") {
        // A game key on the ready card starts the game, and only starts it.
        store.dispatch({ type: "start" });
        return;
      }
      const [next, commands] = keyDown(keyboard.current, event.key, performance.now());
      keyboard.current = next;
      store.dispatch(...toActions(commands, phase));
    };
    const onKeyUp = (event: KeyboardEvent) => {
      // No shortcut check here, deliberately. A key pressed plainly and released
      // with a modifier down must still lift, or the piece auto-repeats into the
      // wall with nothing left to stop it.
      if (!isGameKey(event.key)) return;
      const [next, commands] = keyUp(keyboard.current, event.key, performance.now());
      keyboard.current = next;
      store.dispatch(...toActions(commands, store.getState().phase));
    };
    // A key released while another window has focus never reaches us. Without
    // this the piece would auto-repeat into the wall the moment play resumes.
    const onBlur = () => {
      keyboard.current = createKeyboard();
      store.dispatch({ type: "softDrop", on: false });
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [store, audio]);

  // Belt and braces for the user-select rules in index.css: some WebKit builds
  // still begin a selection from a touch drag, which drops the loupe and the
  // copy callout on top of the board mid-move.
  useEffect(() => {
    const onSelectStart = (event: Event) => event.preventDefault();
    document.addEventListener("selectstart", onSelectStart);
    return () => document.removeEventListener("selectstart", onSelectStart);
  }, []);

  // The same drag also wakes iOS's own text-interaction gesture, which shows
  // the loupe over the board when a touch lingers before it moves sideways.
  // Neither touch-action nor user-select governs that gesture; only refusing
  // the touch's default does, and React's touch listeners are passive, so the
  // listener is a native one. A touch on a button keeps its default, because
  // refusing it would cost the button its click.
  useEffect(() => {
    const playArea = playAreaRef.current;
    if (playArea === null) return;
    const onTouchStart = (event: TouchEvent) => {
      if (controlAt(event.target) !== null) return;
      // A card keeps its default too. No gesture is recognised while one is up,
      // and refusing the touch would refuse with it the scroll that a card
      // taller than the play area -- a phone held sideways -- depends on. A
      // stray loupe over a card is a smaller price than text nobody can reach.
      if (cardAt(event.target) !== null) return;
      event.preventDefault();
    };
    playArea.addEventListener("touchstart", onTouchStart, { passive: false });
    return () => playArea.removeEventListener("touchstart", onTouchStart);
  }, []);

  // A touch that ends with the page ends without a pointerup: the OS takes the
  // gesture -- app switcher, notification shade, an incoming call -- and the
  // pointercancel that ought to follow is not something every browser sends.
  // The recognizer would keep that pointer and ignore every touch after it, so
  // it is forgotten here, exactly as the keyboard is forgotten on blur above.
  useEffect(() => {
    const forget = () => {
      recognizer.current = createRecognizer();
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") forget();
    };
    window.addEventListener("blur", forget);
    window.addEventListener("pagehide", forget);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("blur", forget);
      window.removeEventListener("pagehide", forget);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, []);

  // Leaving the tab pauses the game. Coming back never resumes it by itself,
  // but it does wake the audio context, which browsers suspend in the background.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") {
        audio.unlock();
        return;
      }
      const phase = store.getState().phase;
      if (phase === "playing" || phase === "clearing") store.dispatch({ type: "pause" });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [store, audio]);

  // Feedback listens to the store directly so no event batch is ever skipped by rendering.
  useEffect(
    () =>
      store.subscribe(() => {
        for (const event of store.getState().events) {
          audio.play(event);
          vibrateFor(event);
        }
      }),
    [store, audio],
  );

  const onFrame = useCallback(
    (now: number, dtMs: number) => {
      const [next, commands] = keyboardTick(keyboard.current, now);
      keyboard.current = next;
      store.dispatch(...toActions(commands, store.getState().phase), { type: "tick", dtMs });
    },
    [store],
  );
  // Only these two phases advance with time; the rest are waiting on the player.
  useGameLoop(onFrame, state.phase === "playing" || state.phase === "clearing");

  const gestureContext = (): GestureContext => ({
    cellPx,
    activeCol: store.getState().active?.col ?? null,
  });

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    audio.unlock();
    const phase = store.getState().phase;
    if (phase === "ready") {
      // Anywhere on the card starts the game -- except on a control, which the
      // player reached for to use it. Start is the exception that proves it:
      // its own click handler starts the game a moment later.
      if (controlAt(event.target) === null) store.dispatch({ type: "start" });
      return;
    }
    if (phase !== "playing" && phase !== "clearing") return;
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    recognizer.current = pointerDown(recognizer.current, event.pointerId, sampleOf(event));
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const [next, actions] = pointerMove(
      recognizer.current,
      event.pointerId,
      sampleOf(event),
      gestureContext(),
    );
    recognizer.current = next;
    store.dispatch(...actions);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const [next, actions] = pointerUp(
      recognizer.current,
      event.pointerId,
      sampleOf(event),
      gestureContext(),
    );
    recognizer.current = next;
    store.dispatch(...actions);
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    recognizer.current = pointerCancel(recognizer.current, event.pointerId);
  };

  return (
    <div className="app">
      <TopBar
        linesCleared={state.linesCleared}
        phase={state.phase}
        muted={muted}
        onToggleMute={() => setMuted(audio.toggleMute())}
        onTogglePause={togglePause}
      />
      <main
        ref={playAreaRef}
        className="play-area"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div ref={boardRef} className="board-slot">
          <Board
            board={state.board}
            active={state.active}
            clearingRows={state.clearing?.rows}
            events={state.events}
            pieceCount={state.pieceCount}
            reducedMotion={reducedMotion}
            over={state.phase === "over"}
          />
        </div>
        <Overlay
          phase={state.phase}
          linesCleared={state.linesCleared}
          inputType={inputType}
          classic={state.selector.classic}
          onStart={() => store.dispatch({ type: "start" })}
          onResume={() => store.dispatch({ type: "resume" })}
          onRestart={() => store.dispatch({ type: "restart" })}
          onSetClassic={(classic) => {
            settings.setClassic(classic);
            store.dispatch({ type: "setClassic", on: classic });
          }}
        />
      </main>
    </div>
  );
}

export default App;

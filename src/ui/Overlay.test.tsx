import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Overlay } from "./Overlay.tsx";

function renderOverlay(props: Partial<Parameters<typeof Overlay>[0]> = {}) {
  const handlers = {
    onStart: vi.fn<() => void>(),
    onResume: vi.fn<() => void>(),
    onRestart: vi.fn<() => void>(),
    onSetClassic: vi.fn<(classic: boolean) => void>(),
  };
  render(
    <Overlay
      phase="ready"
      linesCleared={0}
      inputType="keyboard"
      classic={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("Overlay", () => {
  it("shows the title, keyboard hints and a start button while ready", async () => {
    const { onStart } = renderOverlay({ phase: "ready", inputType: "keyboard" });
    expect(screen.getByRole("heading", { name: /easytris/i })).toBeInTheDocument();
    expect(screen.getByText(/space/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /start/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("says what the game is about on the ready card", () => {
    renderOverlay({ phase: "ready" });
    expect(screen.getByText(/wants you to win/i)).toBeInTheDocument();
  });

  it("demonstrates the idea under the title: the picture hidden, the words not", () => {
    renderOverlay({ phase: "ready" });
    expect(document.querySelector(".intro-board")).toHaveAttribute("aria-hidden", "true");
    expect(document.querySelector(".intro-rail")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText(/reads your board/i)).toBeInTheDocument();
  });

  it("holds the demo still once the card is on its way out", () => {
    const handlers = {
      onStart: vi.fn<() => void>(),
      onResume: vi.fn<() => void>(),
      onRestart: vi.fn<() => void>(),
      onSetClassic: vi.fn<(classic: boolean) => void>(),
    };
    const { rerender } = render(
      <Overlay phase="ready" linesCleared={0} inputType="keyboard" classic={false} {...handlers} />,
    );
    expect(document.querySelector(".intro")).not.toHaveAttribute("data-beat", "still");

    rerender(
      <Overlay
        phase="playing"
        linesCleared={0}
        inputType="keyboard"
        classic={false}
        {...handlers}
      />,
    );

    expect(document.querySelector(".intro")).toHaveAttribute("data-beat", "still");
  });

  it("shows touch hints and a tap-to-start button for touch input", () => {
    renderOverlay({ phase: "ready", inputType: "touch" });
    expect(screen.getByText(/drag/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tap to start/i })).toBeInTheDocument();
    expect(screen.queryByText(/space/i)).toBeNull();
  });

  it("offers resume and restart while paused", async () => {
    const { onResume, onRestart } = renderOverlay({ phase: "paused" });
    expect(screen.getByRole("heading", { name: /paused/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /resume/i }));
    await userEvent.click(screen.getByRole("button", { name: /restart/i }));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("shows lines cleared and a play-again button when the game is over", async () => {
    const { onRestart } = renderOverlay({ phase: "over", linesCleared: 12 });
    expect(screen.getByRole("heading", { name: /game over/i })).toBeInTheDocument();
    expect(screen.getByText(/12 lines/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /play again/i }));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("renders no card while playing or clearing", () => {
    const { rerender } = render(
      <Overlay
        phase="playing"
        linesCleared={0}
        inputType="keyboard"
        classic={false}
        onStart={vi.fn<() => void>()}
        onResume={vi.fn<() => void>()}
        onRestart={vi.fn<() => void>()}
        onSetClassic={vi.fn<(classic: boolean) => void>()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(
      <Overlay
        phase="clearing"
        linesCleared={0}
        inputType="keyboard"
        classic={false}
        onStart={vi.fn<() => void>()}
        onResume={vi.fn<() => void>()}
        onRestart={vi.fn<() => void>()}
        onSetClassic={vi.fn<(classic: boolean) => void>()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("announces the phase through a polite live region", () => {
    renderOverlay({ phase: "paused" });
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toMatch(/paused/i);
  });
});

describe("Overlay focus", () => {
  it("holds focus on the ready card itself, so Start arrives without a ring", () => {
    renderOverlay({ phase: "ready" });
    expect(screen.getByRole("dialog")).toHaveFocus();
    expect(screen.getByRole("button", { name: /^start$/i })).not.toHaveFocus();
  });

  it("puts focus on the card's main action so it can be used from the keyboard", () => {
    renderOverlay({ phase: "paused" });
    expect(screen.getByRole("button", { name: /resume/i })).toHaveFocus();
  });

  it("follows the card when one replaces another", () => {
    const handlers = {
      onStart: vi.fn<() => void>(),
      onResume: vi.fn<() => void>(),
      onRestart: vi.fn<() => void>(),
      onSetClassic: vi.fn<(classic: boolean) => void>(),
    };
    const { rerender } = render(
      <Overlay
        phase="paused"
        linesCleared={0}
        inputType="keyboard"
        classic={false}
        {...handlers}
      />,
    );
    rerender(
      <Overlay phase="over" linesCleared={3} inputType="keyboard" classic={false} {...handlers} />,
    );
    expect(screen.getByRole("button", { name: /play again/i })).toHaveFocus();
  });

  it("takes focus back out of the card once it is hidden", () => {
    const handlers = {
      onStart: vi.fn<() => void>(),
      onResume: vi.fn<() => void>(),
      onRestart: vi.fn<() => void>(),
      onSetClassic: vi.fn<(classic: boolean) => void>(),
    };
    const { rerender } = render(
      <Overlay
        phase="paused"
        linesCleared={0}
        inputType="keyboard"
        classic={false}
        {...handlers}
      />,
    );
    const resume = screen.getByRole("button", { name: /resume/i });

    rerender(
      <Overlay
        phase="playing"
        linesCleared={0}
        inputType="keyboard"
        classic={false}
        {...handlers}
      />,
    );

    expect(resume).not.toHaveFocus();
    expect(screen.getByRole("dialog", { hidden: true }).contains(document.activeElement)).toBe(
      false,
    );
  });

  it("does not claim a modality it cannot enforce, so the top bar stays reachable", () => {
    renderOverlay({ phase: "paused" });
    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-modal");
  });
});

describe("Overlay transitions", () => {
  it("keeps the last card mounted with the exit class while play continues, then swaps cards", () => {
    const handlers = {
      onStart: vi.fn<() => void>(),
      onResume: vi.fn<() => void>(),
      onRestart: vi.fn<() => void>(),
      onSetClassic: vi.fn<(classic: boolean) => void>(),
    };
    const { rerender } = render(
      <Overlay
        phase="paused"
        linesCleared={0}
        inputType="keyboard"
        classic={false}
        {...handlers}
      />,
    );
    expect(screen.getByRole("dialog")).not.toHaveClass("overlay--exit");

    rerender(
      <Overlay
        phase="playing"
        linesCleared={0}
        inputType="keyboard"
        classic={false}
        {...handlers}
      />,
    );
    const exiting = screen.getByRole("dialog", { hidden: true });
    expect(exiting).toHaveClass("overlay--exit");
    expect(exiting).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("heading", { name: /paused/i, hidden: true })).toBeInTheDocument();

    rerender(
      <Overlay phase="over" linesCleared={3} inputType="keyboard" classic={false} {...handlers} />,
    );
    const over = screen.getByRole("dialog");
    expect(over).not.toHaveClass("overlay--exit");
    expect(over).toHaveClass("overlay--over");
    expect(screen.getByRole("heading", { name: /game over/i })).toBeInTheDocument();
  });
});

describe("piece supply", () => {
  it("offers both supplies on every card that stops play", () => {
    for (const phase of ["ready", "paused", "over"] as const) {
      const { unmount } = render(
        <Overlay
          phase={phase}
          linesCleared={0}
          inputType="keyboard"
          classic={false}
          onStart={vi.fn<() => void>()}
          onResume={vi.fn<() => void>()}
          onRestart={vi.fn<() => void>()}
          onSetClassic={vi.fn<(classic: boolean) => void>()}
        />,
      );
      expect(screen.getByRole("button", { name: /helpful/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /random/i })).toBeInTheDocument();
      unmount();
    }
  });

  it("shows which supply is in use", () => {
    renderOverlay({ phase: "paused", classic: false });
    expect(screen.getByRole("button", { name: /helpful/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /random/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("shows the classic supply as the one in use when it is", () => {
    renderOverlay({ phase: "paused", classic: true });
    expect(screen.getByRole("button", { name: /random/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("asks for the supply that was clicked", async () => {
    const { onSetClassic } = renderOverlay({ phase: "paused", classic: false });

    await userEvent.click(screen.getByRole("button", { name: /random/i }));
    expect(onSetClassic).toHaveBeenLastCalledWith(true);

    await userEvent.click(screen.getByRole("button", { name: /helpful/i }));
    expect(onSetClassic).toHaveBeenLastCalledWith(false);
  });

  it("gives focus back after a click, so Space still reaches the game", async () => {
    renderOverlay({ phase: "paused", classic: false });

    await userEvent.click(screen.getByRole("button", { name: /random/i }));

    expect(screen.getByRole("button", { name: /random/i })).not.toHaveFocus();
  });
});

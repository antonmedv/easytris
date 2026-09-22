import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TopBar } from "./TopBar.tsx";

function renderTopBar(props: Partial<Parameters<typeof TopBar>[0]> = {}) {
  const handlers = { onToggleMute: vi.fn<() => void>(), onTogglePause: vi.fn<() => void>() };
  render(<TopBar linesCleared={0} phase="playing" muted={false} {...handlers} {...props} />);
  return handlers;
}

describe("TopBar", () => {
  it("shows the lines cleared", () => {
    renderTopBar({ linesCleared: 12 });
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText(/lines/i)).toBeInTheDocument();
  });

  it("toggles pause while playing and reads Resume while paused", async () => {
    const { onTogglePause } = renderTopBar({ phase: "playing" });
    await userEvent.click(screen.getByRole("button", { name: /pause/i }));
    expect(onTogglePause).toHaveBeenCalledTimes(1);
  });

  it("labels the pause button Resume while paused", () => {
    renderTopBar({ phase: "paused" });
    expect(screen.getByRole("button", { name: /resume/i })).toBeEnabled();
  });

  it("disables the pause button while ready and after game over", () => {
    const { rerender } = render(
      <TopBar
        linesCleared={0}
        phase="ready"
        muted={false}
        onToggleMute={vi.fn<() => void>()}
        onTogglePause={vi.fn<() => void>()}
      />,
    );
    expect(screen.getByRole("button", { name: /pause/i })).toBeDisabled();
    rerender(
      <TopBar
        linesCleared={3}
        phase="over"
        muted={false}
        onToggleMute={vi.fn<() => void>()}
        onTogglePause={vi.fn<() => void>()}
      />,
    );
    expect(screen.getByRole("button", { name: /pause/i })).toBeDisabled();
  });

  it("links to the source on GitHub, in a tab of its own", () => {
    renderTopBar();
    const link = screen.getByRole("link", { name: /github/i });
    expect(link).toHaveAttribute("href", "https://github.com/antonmedv/easytris");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("reflects the muted state and toggles it", async () => {
    const { onToggleMute } = renderTopBar({ muted: false });
    const button = screen.getByRole("button", { name: /^mute/i });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    expect(onToggleMute).toHaveBeenCalledTimes(1);
  });

  it("labels the mute button Unmute when muted", () => {
    renderTopBar({ muted: true });
    expect(screen.getByRole("button", { name: /unmute/i })).toHaveAttribute("aria-pressed", "true");
  });
});

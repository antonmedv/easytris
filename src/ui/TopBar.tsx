import type { Phase } from "../engine/types.ts";
import { releaseAfterPointer } from "./focus.ts";

import "./TopBar.css";

const REPO_URL = "https://github.com/antonmedv/easytris";

type TopBarProps = {
  readonly linesCleared: number;
  readonly phase: Phase;
  readonly muted: boolean;
  readonly onToggleMute: () => void;
  readonly onTogglePause: () => void;
};

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      {muted ? (
        <path d="m16 9 5 5m0-5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path
          d="M16 8.5a5 5 0 0 1 0 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

function PauseIcon({ paused }: { paused: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      {paused ? (
        <path d="M8 5v14l11-7z" fill="currentColor" />
      ) : (
        <path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor" />
      )}
    </svg>
  );
}

export function TopBar({ linesCleared, phase, muted, onToggleMute, onTogglePause }: TopBarProps) {
  const paused = phase === "paused";
  return (
    <header className="top-bar">
      <p className="top-bar-lines">
        <span className="top-bar-lines-value">{linesCleared}</span>
        <span className="top-bar-lines-label">lines</span>
      </p>
      <div className="top-bar-actions">
        <a
          className="top-bar-button"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Source on GitHub"
        >
          <GitHubIcon />
        </a>
        <button
          type="button"
          className="top-bar-button"
          aria-label={muted ? "Unmute" : "Mute"}
          aria-pressed={muted}
          onClick={(event) => {
            releaseAfterPointer(event);
            onToggleMute();
          }}
        >
          <SpeakerIcon muted={muted} />
        </button>
        <button
          type="button"
          className="top-bar-button"
          aria-label={paused ? "Resume" : "Pause"}
          disabled={phase === "ready" || phase === "over"}
          onClick={(event) => {
            releaseAfterPointer(event);
            onTogglePause();
          }}
        >
          <PauseIcon paused={paused} />
        </button>
      </div>
    </header>
  );
}

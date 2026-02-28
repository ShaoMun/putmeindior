"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "mapillary-js/dist/mapillary.css";
import "./simulator.css";
import { useMapillaryView } from "./useMapillaryView";
import { useHandGesture } from "./useHandGesture";
import VirtualHandsOverlay from "./VirtualHandsOverlay";

const STREET_VIEW_INITIAL = { lat: 3.149215, lng: 101.713529 };
const STEP_THROTTLE_MS = 400;

const STEPS_PER_UPDATE = 3;
const TRANSITION_EMOJI_MS = 1800;
const TYPEWRITER_CHAR_MS = 18;
const FIRST_STEPS_NO_CONTEXT = 6;

type AssistantStatus = "next" | "praise" | "warning" | "advice" | "danger";

type SectionBlock = { label: string; text: string };

/**
 * Each update has separate sections (subtitles + content) so the modal can show Probability, Analysis, Suggested path, Solution in blocks.
 */
const ASSISTANT_UPDATES: {
  subtitle: string;
  status: AssistantStatus;
  sections: SectionBlock[];
}[] = [
  {
    subtitle: "Initial assessment",
    status: "next",
    sections: [
      {
        label: "Assessment",
        text: "Path ahead likely clear toward the nearest exit. Proceed with normal egress.",
      },
      {
        label: "Analysis",
        text: "I am tracking your position, heading, and layout; the clearest route appears straight ahead. No obstructions or structural anomalies detected in this direction.",
      },
      {
        label: "Suggested path",
        text: "Proceed toward the exit at a steady pace.",
      },
      {
        label: "Solution",
        text: "Stay calm and do not run; use the stairs only — do not use elevators. I will keep updating and will warn you if the suggested path changes or hazards appear.",
      },
    ],
  },
  {
    subtitle: "Route analysis",
    status: "praise",
    sections: [
      {
        label: "Assessment",
        text: "Current route appears safe for the next segment. No immediate hazards detected.",
      },
      {
        label: "Analysis",
        text: "Your movement and direction are aligned with a path leading away from the building core; no major obstructions or immediate hazards visible. Risk of falling objects or glass is low; aftershock risk is moderate.",
      },
      {
        label: "Suggested path",
        text: "Keep to this route.",
      },
      {
        label: "Solution",
        text: "Avoid areas near large windows, glass facades, hanging fixtures, or heavy furniture. If I detect a safer option or a change in probability, I will update you immediately.",
      },
    ],
  },
  {
    subtitle: "Situation update",
    status: "advice",
    sections: [
      {
        label: "Assessment",
        text: "Path to an exit likely passable; conditions may vary ahead. Stay alert.",
      },
      {
        label: "Analysis",
        text: "You are making progress toward a likely exit; the path ahead may have variable visibility or minor debris. Blocked or partially blocked routes cannot be ruled out; alternate routes exist in the building model.",
      },
      {
        label: "Suggested path",
        text: "Continue forward; if blocked, divert to the nearest alternate.",
      },
      {
        label: "Solution",
        text: "Do not force your way through debris; look for a safe area to shelter briefly if needed. Stay low if there is dust or poor visibility. I will reassess and suggest the next best move.",
      },
    ],
  },
  {
    subtitle: "Hazard awareness",
    status: "warning",
    sections: [
      {
        label: "Assessment",
        text: "Hazards possible in this direction — dust, falling debris, or unstable structures. Elevated risk.",
      },
      {
        label: "Analysis",
        text: "Visibility may be reduced; the path may be uneven or partially obstructed. Elevated risk of non-structural hazards (fixtures, cladding); structural integrity in this zone is uncertain.",
      },
      {
        label: "Suggested path",
        text: "Prefer staying low and moving toward the exit along the current bearing if it remains passable.",
      },
      {
        label: "Solution",
        text: "Protect your head with your arms or any available object; avoid rushing. Do not use elevators or enter confined spaces. I am monitoring and will advise if the path is harmful or a direction change is recommended.",
      },
    ],
  },
  {
    subtitle: "Critical hazard",
    status: "danger",
    sections: [
      {
        label: "Assessment",
        text: "Area ahead assessed as very dangerous. Do not proceed in this direction.",
      },
      {
        label: "Analysis",
        text: "Structural instability, falling debris, or blocked exits are likely in this direction; continuing could result in serious injury or entrapment. This segment is flagged as high-risk; alternate routes show lower probability of hazard.",
      },
      {
        label: "Suggested path",
        text: "Stop and change direction immediately.",
      },
      {
        label: "Solution",
        text: "Seek an alternate route or a structurally safer area (e.g. under a strong desk, against an interior wall away from windows). Do not proceed forward until I indicate a safer path. I will reassess and guide you to a lower-risk route.",
      },
    ],
  },
  {
    subtitle: "Progress check",
    status: "praise",
    sections: [
      {
        label: "Assessment",
        text: "Current direction is safe and aligned with the recommended escape route.",
      },
      {
        label: "Analysis",
        text: "You have changed direction or moved to a safer segment; your movement is consistent with egress toward open ground. Hazard probability on this path is low; you are doing the right thing.",
      },
      {
        label: "Suggested path",
        text: "Continue at this pace toward the assembly point or any open space away from the building.",
      },
      {
        label: "Solution",
        text: "Do not re-enter the building until it has been declared safe. I will keep monitoring and will warn you again if hazard probability increases.",
      },
    ],
  },
  {
    subtitle: "Next steps",
    status: "advice",
    sections: [
      {
        label: "Assessment",
        text: "Exit or open area likely ahead with few immediate hazards.",
      },
      {
        label: "Analysis",
        text: "You are on a clearer path; the environment suggests you are close to an exit. Remaining risk is mostly from last obstacles or debris; follow standard egress protocol.",
      },
      {
        label: "Suggested path",
        text: "Keep moving along your current path.",
      },
      {
        label: "Solution",
        text: "Once outside, move away from walls, glass, and overhangs; find the assembly point and wait for roll call or further instructions. I will keep analyzing your position and alert you if any new hazards or a direction change is needed.",
      },
    ],
  },
  {
    subtitle: "Final stretch",
    status: "praise",
    sections: [
      {
        label: "Assessment",
        text: "You are close to a safer area; immediate environment appears less hazardous.",
      },
      {
        label: "Analysis",
        text: "You are near a safer zone; stay alert for any last obstacles or debris. You have followed the recommended behavior; remaining risk is low.",
      },
      {
        label: "Suggested path",
        text: "Once outside, remain at the assembly point.",
      },
      {
        label: "Solution",
        text: "Avoid re-entering until authorities give the all-clear. I will continue to monitor and advise if anything changes.",
      },
    ],
  },
];

/** Every context switch shows a pulsing emoji: danger ❌, warning ⚠️, safe (including safe→safe) ✓. */
function getTransitionEmoji(
  prevStatus: AssistantStatus | null,
  nextStatus: AssistantStatus
): string {
  const isSafe = (s: AssistantStatus) => s === "next" || s === "praise" || s === "advice";
  if (nextStatus === "danger") return "❌";
  if (nextStatus === "warning") return "⚠️";
  if (prevStatus && (prevStatus === "warning" || prevStatus === "danger") && isSafe(nextStatus))
    return "✓";
  return "✓";
}

const NO_CONTEXT_UPDATE_INDEX = -1;

export type HintResult = {
  title: string;
  subtitle: string;
  message: string;
  status: AssistantStatus;
  updateIndex: number;
  sections?: SectionBlock[];
};

function getHint(stepCount: number): HintResult {
  if (stepCount < FIRST_STEPS_NO_CONTEXT) {
    return {
      title: "Escape assistant",
      subtitle: "Proceeding",
      message: "Proceeding. Guidance will begin after a few more steps.",
      status: "next",
      updateIndex: NO_CONTEXT_UPDATE_INDEX,
    };
  }
  const effectiveStep = stepCount - FIRST_STEPS_NO_CONTEXT;
  const updateIndex = Math.min(
    Math.floor(effectiveStep / STEPS_PER_UPDATE),
    ASSISTANT_UPDATES.length - 1
  );
  const entry = ASSISTANT_UPDATES[updateIndex];
  const message = entry.sections.map((s) => s.text).join("");
  return {
    title: "Escape assistant",
    subtitle: entry.subtitle,
    message,
    status: entry.status,
    updateIndex,
    sections: entry.sections,
  };
}

interface SimulatorProps {
  onExit: () => void;
}

export default function Simulator({ onExit }: SimulatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onViewClickRef = useRef<(() => void) | undefined>(undefined);
  const lastStepTime = useRef(0);
  const keysDownRef = useRef<Set<string>>(new Set());
  const previousStatusRef = useRef<AssistantStatus | null>(null);
  const previousUpdateIndexRef = useRef<number>(-1);
  const canAdvanceRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [stepCount, setStepCount] = useState(0);
  const [phase, setPhase] = useState<"transition" | "typing" | "idle">("typing");
  const [transitionEmoji, setTransitionEmoji] = useState<string | null>(null);
  const [displayedText, setDisplayedText] = useState("");
  const [currentHint, setCurrentHint] = useState<HintResult>(() => getHint(0));

  // Allow advancing when idle, or during first 6 steps (no context — no need to wait)
  canAdvanceRef.current = phase === "idle" || stepCount < FIRST_STEPS_NO_CONTEXT;

  const {
    moveForward,
    ready: streetViewReady,
    error: streetViewError,
  } = useMapillaryView(containerRef, STREET_VIEW_INITIAL, {
    onViewClickRef,
  });

  const advanceStep = useCallback(() => {
    setStepCount((c) => c + 1);
    moveForward();
  }, [moveForward]);

  useEffect(() => {
    onViewClickRef.current = () => {
      if (canAdvanceRef.current) advanceStep();
    };
  }, [advanceStep]);

  const { landmarks, gesture, ready: handReady, cameraError, retry } = useHandGesture();

  const handleStep = useCallback(() => {
    if (!canAdvanceRef.current) return;
    const now = Date.now();
    if (now - lastStepTime.current < STEP_THROTTLE_MS) return;
    lastStepTime.current = now;
    advanceStep();
  }, [advanceStep]);

  useEffect(() => {
    if (!handReady || gesture === "idle") return;
    if (gesture === "step" || gesture === "run") {
      handleStep();
    }
  }, [gesture, handReady, handleStep]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "ArrowUp") return;
      if (e.repeat || keysDownRef.current.has(e.key)) return;
      keysDownRef.current.add(e.key);
      e.preventDefault();
      handleStep();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysDownRef.current.delete(e.key);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [handleStep]);

  useEffect(() => {
    if (streetViewError) setError(streetViewError);
  }, [streetViewError]);

  // When stepCount changes: first 6 steps = minimal message, no transition/typewriter; from step 6 onward = full context
  useEffect(() => {
    const hint = getHint(stepCount);
    const prevIndex = previousUpdateIndexRef.current;

    if (stepCount < FIRST_STEPS_NO_CONTEXT) {
      setCurrentHint(hint);
      setPhase("idle");
      setDisplayedText(hint.message);
      return;
    }

    if (hint.updateIndex !== prevIndex) {
      const oldStatus = prevIndex >= 0 ? ASSISTANT_UPDATES[prevIndex]?.status ?? null : null;
      const emoji = prevIndex === NO_CONTEXT_UPDATE_INDEX ? "✓" : getTransitionEmoji(oldStatus, hint.status);
      setTransitionEmoji(emoji);
      setCurrentHint(hint);
      setPhase("transition");
      previousStatusRef.current = hint.status;
      previousUpdateIndexRef.current = hint.updateIndex;

      const t = setTimeout(() => {
        setPhase("typing");
        setDisplayedText("");
        setTransitionEmoji(null);
      }, TRANSITION_EMOJI_MS);
      return () => clearTimeout(t);
    }
  }, [stepCount]);

  // Typewriter: reveal current message character by character
  useEffect(() => {
    if (phase !== "typing") return;
    const full = currentHint.message;
    if (displayedText.length >= full.length) {
      setPhase("idle");
      return;
    }
    const id = setTimeout(() => {
      const next = full.slice(0, displayedText.length + 1);
      setDisplayedText(next);
      if (next.length >= full.length) setPhase("idle");
    }, TYPEWRITER_CHAR_MS);
    return () => clearTimeout(id);
  }, [phase, displayedText, currentHint.message]);

  const loading = !streetViewReady && !streetViewError;
  const showTransitionEmoji = phase === "transition" && transitionEmoji;
  const showTypewriter = phase === "typing" || phase === "idle";

  return (
    <div className="simulator-root">
      <div ref={containerRef} className="simulator-streetview" />

      <div className="simulator-overlay">
        <VirtualHandsOverlay landmarks={landmarks} />
      </div>

      {/* Right-side panel: real-time escape assistant (typewriter + pulsing emoji) */}
      <div className="simulator-hints frosted-panel">
        <div className="simulator-hints-header">
          <h2 className="simulator-hints-title">{currentHint.title}</h2>
          <p className="simulator-hints-subtitle">{currentHint.subtitle}</p>
        </div>
        <div className="simulator-hints-body">
          {showTransitionEmoji && (
            <div className={`simulator-hints-emoji emoji-${transitionEmoji === "❌" ? "danger" : transitionEmoji === "⚠️" ? "warning" : "safe"}`}>
              {transitionEmoji}
            </div>
          )}
          {showTypewriter && currentHint.sections && currentHint.sections.length > 0 ? (
            <div className="simulator-hints-sections">
              {currentHint.sections.map((section, i) => {
                const start = currentHint.sections!.slice(0, i).reduce((sum, s) => sum + s.text.length, 0);
                const len = section.text.length;
                const sectionText = displayedText.slice(start, start + len);
                const showCursor = phase === "typing" && displayedText.length >= start && displayedText.length < start + len;
                return (
                  <div key={i} className="simulator-hints-section">
                    <p className="simulator-hints-section-title">{section.label}</p>
                    <div className={`simulator-hints-message status-${currentHint.status}`}>
                      {sectionText}
                      {showCursor && <span className="simulator-hints-cursor" aria-hidden />}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : showTypewriter ? (
            <div className={`simulator-hints-message status-${currentHint.status}`}>
              {displayedText}
              {phase === "typing" && <span className="simulator-hints-cursor" aria-hidden />}
            </div>
          ) : null}
        </div>
      </div>

      <div className="simulator-controls">
        <button
          type="button"
          className="simulator-exit-btn"
          onClick={onExit}
          aria-label="Exit simulator"
        >
          Exit
        </button>
      </div>

      {loading && (
        <div className="simulator-loading">Loading Street View…</div>
      )}
      {error && (
        <div className="simulator-error">
          <span>{error}</span>
          <button
            type="button"
            className="simulator-exit-btn"
            onClick={onExit}
          >
            Exit
          </button>
        </div>
      )}
    </div>
  );
}

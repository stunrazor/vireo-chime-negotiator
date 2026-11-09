// Chime orb for the Negotiator demo — adapted from the design-system
// ChimeOrb (same states, same motion rules). The artwork is served from
// public/ so no asset import typing is needed.
import "./chime-orb.css";

const chimeVoiceOrb = `${import.meta.env.BASE_URL}images/chime-voice-orb.png`;

export type ChimeWorkspaceCue = "monitoring" | "blocker" | "review";

type ChimeOrbProps = {
  state: ChimeWorkspaceCue;
  className?: string;
  replayKey?: number;
  animate?: boolean;
  speaking?: boolean;
};

const stateLabels: Record<ChimeWorkspaceCue, string> = {
  monitoring: "quietly monitoring authorized workspace activity",
  blocker: "a new workflow blocker was detected",
  review: "a suggestion is waiting for human review",
};

export function ChimeOrb({
  state,
  className = "size-10",
  replayKey = 0,
  animate = false,
  speaking = false,
}: ChimeOrbProps) {
  return (
    <span
      className={`chime-orb ${className}`}
      role="img"
      aria-label={`Chime: ${stateLabels[state]}`}
      data-state={state}
      data-speaking={speaking}
    >
      {state === "blocker" ? (
        <>
          <span key={`blocker-a-${replayKey}`} className="chime-orb__halo chime-orb__halo--blocker" aria-hidden="true" />
          <span key={`blocker-b-${replayKey}`} className="chime-orb__halo chime-orb__halo--blocker chime-orb__halo--delayed" aria-hidden="true" />
        </>
      ) : (
        <span
          key={`${state}-${replayKey}`}
          className={`chime-orb__halo chime-orb__halo--${state}${state === "monitoring" && animate ? " chime-orb__halo--active" : ""}`}
          aria-hidden="true"
        />
      )}
      <span className="chime-orb__character" aria-hidden="true">
        <img src={chimeVoiceOrb} alt="" className="chime-orb__image" />
        <span className="chime-orb__eyes">
          <span />
          <span />
        </span>
      </span>
    </span>
  );
}

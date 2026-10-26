import { Check, LoaderCircle } from "lucide-react";
import { specialists } from "./specialists";

export default function ReviewProgress({ current, states, latest }) {
  return (
    <div className="progress-card">
      <div className="progress-title">
        {current.status === "running" ? (
          <>
            <span className="typing-dots">
              <i />
              <i />
              <i />
            </span>{" "}
            Taking a closer look
          </>
        ) : current.status === "error" ? (
          "Review interrupted"
        ) : (
          <>
            <Check size={16} /> Analysis complete
          </>
        )}
      </div>
      {specialists.map(({ id, name, icon: Icon, color }) => (
        <div className="agent-progress" key={id}>
          <span className={`agent-icon ${color}`}>
            <Icon size={16} />
          </span>
          <span>{name}</span>
          <small>
            {states[id] === "complete"
              ? "Complete"
              : states[id] === "error"
                ? "Incomplete"
                : states[id] === "running"
                  ? "Reviewing…"
                  : current.status === "error"
                    ? "Not completed"
                    : "Waiting"}
          </small>
          {states[id] === "running" && current.status === "running" ? (
            <LoaderCircle className="spin" size={14} />
          ) : states[id] === "complete" ? (
            <Check size={14} className="green" />
          ) : (
            <span className="waiting-dot" />
          )}
        </div>
      ))}
      <div className="progress-note" role="status">
        {states.orchestrator === "running" && current.status === "running" && (
          <LoaderCircle className="spin" size={14} aria-hidden="true" />
        )}
        <span>
          {latest?.message ||
            (current.report
              ? "Report assembled and prioritized."
              : "Connecting to your review…")}
        </span>
      </div>
      <details className="activity">
        <summary>View activity</summary>
        {current.events
          .filter((e) => e.message)
          .map((e) => (
            <p key={e.id}>{e.message}</p>
          ))}
      </details>
    </div>
  );
}

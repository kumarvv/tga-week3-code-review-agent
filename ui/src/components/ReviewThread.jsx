import {
  ArrowUpRight,
  Check,
  FileArchive,
  Github,
  Layers3,
} from "lucide-react";
import Report from "./Report";
import ReviewProgress from "./ReviewProgress";

export default function ReviewThread({
  current,
  states,
  latest,
  setActiveId,
  setUrl,
  setFocus,
}) {
  return (
    <div className="thread">
      <div className="thread-date">YOUR CODE REVIEW</div>
      <div className="user-message">
        <div className="user-bubble">
          <span>
            {current.source.endsWith(".zip") ? (
              <FileArchive size={19} />
            ) : (
              <Github size={19} />
            )}
            {current.source}
          </span>
          {current.focus && <p>{current.focus}</p>}
        </div>
        <span className="sent-label">
          Submitted for review{current.model ? ` · ${current.model}` : ""} <Check size={12} />
        </span>
      </div>
      <div className="assistant-message">
        <div className="bot-avatar">
          <Layers3 size={17} />
        </div>
        <div className="assistant-content">
          <div className="message-label">
            CodeScanner <span>Review orchestrator</span>
          </div>
          <div className="bubble">
            I’ve got your code. The team is checking for bugs, security risks,
            and missing tests in parallel.
          </div>
          <ReviewProgress current={current} states={states} latest={latest} />
          {current.status === "error" && (
            <div className="error" role="alert">
              {latest?.message}
              <button
                onClick={() => {
                  setActiveId(null);
                  if (!current.source.endsWith(".zip")) setUrl(current.source);
                  setFocus(current.focus);
                }}
              >
                Start again <ArrowUpRight size={14} />
              </button>
            </div>
          )}
          {current.report && <Report report={current.report} id={current.id} source={current.source} />}
        </div>
      </div>
    </div>
  );
}

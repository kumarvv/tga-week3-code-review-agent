import {
  GitBranch,
  Layers3,
  MessageSquare,
  Plus,
  ShieldCheck,
} from "lucide-react";

export default function Sidebar({
  current,
  reviews,
  activeId,
  setActiveId,
  setError,
  urlInput,
}) {
  return (
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="CodeScanner home">
        <span className="brand-mark">
          <Layers3 size={22} />
        </span>
        CodeScanner<span className="brand-dot">.</span>
      </a>
      <button
        className="new-review"
        onClick={() => {
          setActiveId(null);
          setError("");
          urlInput.current?.focus();
        }}
      >
        <Plus size={18} /> New review <span>↗</span>
      </button>
      <div className="sidebar-label">WORKSPACE</div>
      <button
        className={`nav-item ${!current ? "active" : ""}`}
        onClick={() => setActiveId(null)}
      >
        <MessageSquare size={17} /> Code reviews{" "}
        <span>{reviews.length.toString().padStart(2, "0")}</span>
      </button>
      <div className="sidebar-label recent-label">THIS SESSION</div>
      <div className="history">
        {reviews.length ? (
          reviews.map((r) => (
            <button
              key={r.id}
              className={`history-item ${activeId === r.id ? "chosen" : ""}`}
              onClick={() => setActiveId(r.id)}
            >
              <GitBranch size={15} />
              <span>{r.source.split("/").filter(Boolean).at(-1)}</span>
              {r.status === "running" && <span className="live-dot" />}
            </button>
          ))
        ) : (
          <p>
            Your next better commit
            <br />
            starts here.
          </p>
        )}
      </div>
      <div className="sidebar-bottom">
        <div className="team-mini">
          <span>
            <ShieldCheck size={16} />
          </span>
          <div>
            Three perspectives.
            <br />
            <strong>One better codebase.</strong>
          </div>
        </div>
        <div className="workspace-user">
          <div className="avatar">Y</div>
          <div>
            Your workspace<small>Local development</small>
          </div>
          <span className="local-dot" />
        </div>
      </div>
    </aside>
  );
}

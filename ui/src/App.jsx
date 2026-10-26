import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Bug,
  Check,
  ChevronDown,
  Code2,
  Download,
  FileArchive,
  GitBranch,
  Github,
  Layers3,
  LoaderCircle,
  MessageSquare,
  Paperclip,
  Plus,
  ShieldCheck,
  Sparkles,
  TestTubeDiagonal,
  X,
} from "lucide-react";

const specialists = [
  {
    id: "bugs",
    name: "Code quality",
    role: "Bugs & anti-patterns",
    icon: Bug,
    color: "violet",
  },
  {
    id: "security",
    name: "Security",
    role: "Vulnerabilities & risks",
    icon: ShieldCheck,
    color: "blue",
  },
  {
    id: "tests",
    name: "Test coverage",
    role: "Gaps & missing tests",
    icon: TestTubeDiagonal,
    color: "amber",
  },
];

function Report({ report, id }) {
  const [filter, setFilter] = useState("all");
  const findings = report.findings.filter(
    (f) => filter === "all" || f.severity === filter,
  );
  return (
    <section className="report">
      <div className="report-heading">
        <div className="success-icon">
          <Check size={19} />
        </div>
        <div>
          <h2>Your review is ready</h2>
          <p>
            {report.scope.files_reviewed} files reviewed ·{" "}
            {report.findings.length} findings
          </p>
        </div>
        <a
          className="download"
          href={`/api/reviews/${id}/report`}
          title="Download Markdown report"
          aria-label="Download Markdown report"
        >
          <Download size={18} />
        </a>
      </div>
      {(report.incomplete || report.synthesis_fallback) && (
        <p className="warning">
          {report.incomplete
            ? "Partial review: a specialist could not finish. See the summaries below."
            : "AI synthesis was unavailable. Specialist findings were combined automatically."}
        </p>
      )}
      <p className="summary">{report.summary}</p>
      <div className="filters" aria-label="Filter findings by severity">
        {["all", "critical", "high", "medium", "low"].map((level) => (
          <button
            key={level}
            className={filter === level ? "selected" : ""}
            onClick={() => setFilter(level)}
          >
            {level}{" "}
            <span>
              {level === "all"
                ? report.findings.length
                : report.findings.filter((f) => f.severity === level).length}
            </span>
          </button>
        ))}
      </div>
      <div className="findings">
        {findings.length ? (
          findings.map((f, i) => (
            <details
              className="finding"
              key={`${f.file}:${f.line}:${i}`}
              open={i === 0}
            >
              <summary>
                <span className={`severity ${f.severity}`}>{f.severity}</span>
                <span className="finding-title">
                  {f.title}
                  <small>
                    {f.file}:{f.line}
                  </small>
                </span>
                <ChevronDown size={16} />
              </summary>
              <div className="finding-body">
                <p>{f.explanation}</p>
                <h4>Suggested next step</h4>
                <p>{f.recommendation}</p>
                <span className="category">{f.category}</span>
              </div>
            </details>
          ))
        ) : (
          <p className="empty-findings">
            {report.findings.length
              ? "No findings at this severity."
              : "No actionable findings were reported. This does not guarantee the code is defect-free."}
          </p>
        )}
      </div>
      <details className="scope">
        <summary>
          Specialist summaries & review scope <ChevronDown size={14} />
        </summary>
        {report.agents.map((agent) => (
          <p key={agent.agent}>
            <strong>
              {agent.agent}
              {agent.failed ? " — incomplete" : ""}
            </strong>
            <br />
            {agent.summary}
          </p>
        ))}
        <p>{report.notice}</p>
        {report.scope.skipped.length > 0 && (
          <>
            <strong>{report.scope.skipped.length} excluded files</strong>
            <ul>
              {report.scope.skipped.map((f, i) => (
                <li key={i}>
                  <code>{f.path}</code> — {f.reason}
                </li>
              ))}
            </ul>
          </>
        )}
      </details>
      <div className="report-footer">
        <span>Review before applying changes</span>
        <a href={`/api/reviews/${id}/report?format=json`}>
          Download JSON <ArrowUpRight size={13} />
        </a>
      </div>
    </section>
  );
}

export default function App() {
  const [url, setUrl] = useState("");
  const [focus, setFocus] = useState("");
  const [file, setFile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);
  const urlInput = useRef(null);
  const bottom = useRef(null);
  const current = reviews.find((r) => r.id === activeId);
  const running = reviews.find((r) => r.status === "running");
  const busy = submitting || !!running;

  useEffect(() => {
    fetch("/api/health")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setHealth)
      .catch(() => setHealth({ offline: true }));
  }, []);

  useEffect(() => {
    if (!running) return;
    let disposed = false,
      socket,
      timer,
      cursor = -1,
      attempts = 0,
      finished = false;
    const id = running.id;
    function accept(event) {
      if (disposed || event.type === "heartbeat" || event.id <= cursor) return;
      cursor = event.id;
      if (event.type === "complete" || event.type === "error") finished = true;
      setReviews((items) =>
        items.map((r) =>
          r.id !== id
            ? r
            : {
                ...r,
                events: [...r.events, event],
                report: event.report || r.report,
                status:
                  event.type === "complete"
                    ? "complete"
                    : event.type === "error"
                      ? "error"
                      : r.status,
              },
        ),
      );
    }
    async function recover() {
      if (disposed || finished) return;
      try {
        const res = await fetch(`/api/reviews/${id}`);
        if (!res.ok) {
          if (res.status === 404) {
            accept({
              id: cursor + 1,
              type: "error",
              message:
                "This review expired or the server restarted. Please submit it again.",
            });
            return;
          }
          throw Error("unavailable");
        }
        const data = await res.json();
        data.events.forEach(accept);
        attempts = 0;
      } catch {
        attempts++;
        if (attempts >= 10) {
          accept({
            id: cursor + 1,
            type: "error",
            message:
              "Connection lost. Your review may still be running; reload the server and start a new review if needed.",
          });
          return;
        }
      }
      if (!disposed && !finished) connect();
    }
    function connect() {
      if (disposed || finished) return;
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/reviews/${id}?after=${cursor}`,
      );
      socket.onmessage = (event) => {
        try {
          accept(JSON.parse(event.data));
        } catch {
          /* Ignore malformed transport frames. */
        }
      };
      socket.onclose = () => {
        if (!disposed && !finished) timer = setTimeout(recover, 2000);
      };
      socket.onerror = () => socket.close();
    }
    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [running?.id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeId, current?.events.length]);

  function chooseFile(selected) {
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".zip")) {
      setError("Please choose a ZIP archive.");
      return;
    }
    if (selected.size > 20 * 1024 * 1024) {
      setError("Your ZIP must be 20 MB or smaller.");
      return;
    }
    setFile(selected);
    setUrl("");
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (
      !file &&
      !/^https:\/\/github\.com\/[\w-]+\/[\w.-]+\/?$/.test(url.trim())
    ) {
      setError(
        "Add a ZIP file or a public URL such as https://github.com/owner/repository.",
      );
      return;
    }
    setSubmitting(true);
    setError("");
    const form = new FormData();
    if (file) form.append("file", file);
    else form.append("repo_url", url.trim());
    form.append("focus", focus);
    try {
      const res = await fetch("/api/reviews", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw Error(
          typeof data.detail === "string"
            ? data.detail
            : `Request failed (${res.status}). Check your input and try again.`,
        );
      const review = {
        id: data.id,
        source: file?.name || url.trim(),
        focus,
        status: "running",
        events: [],
        report: null,
      };
      setReviews((items) => [review, ...items]);
      setActiveId(data.id);
      setUrl("");
      setFile(null);
      setFocus("");
    } catch (e) {
      setError(
        e.message === "Failed to fetch"
          ? "Cannot reach the backend. Start the API server and try again."
          : e.message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const states = Object.fromEntries(
    (current?.events || [])
      .filter((e) => e.agent)
      .map((e) => [e.agent, e.status]),
  );
  const latest = current?.events.at(-1);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Patchwork home">
          <span className="brand-mark">
            <Layers3 size={22} />
          </span>
          patchwork<span className="brand-dot">.</span>
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
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>Code review</strong>
          </div>
          <div className="header-right">
            <span className="private-badge">
              <Code2 size={14} /> Source review
            </span>
            <span
              className={`connection ${health?.offline || health?.configured === false ? "disconnected" : ""}`}
            >
              <i />
              {health === null
                ? "Connecting"
                : health.offline
                  ? "API offline"
                  : health.configured
                    ? "Agents ready"
                    : "Setup needed"}
            </span>
          </div>
        </header>
        <div className="conversation">
          {!current ? (
            <div className="welcome">
              <div className="eyebrow">
                <span /> YOUR SECOND SET OF EYES
              </div>
              <div className="welcome-icon">
                <Code2 size={33} strokeWidth={1.6} />
                <span>
                  <Sparkles size={13} />
                </span>
              </div>
              <h1>
                Good code starts with
                <br />a great conversation<span>.</span>
              </h1>
              <p className="intro">
                Meet your on-demand review team. Share your code,
                <br className="desktop-break" /> and let three specialist agents
                take a closer look.
              </p>
              <div className="agent-cards">
                {specialists.map(({ id, name, role, icon: Icon, color }) => (
                  <div className="agent-card" key={id}>
                    <div className={`agent-icon ${color}`}>
                      <Icon size={20} />
                    </div>
                    <h3>{name}</h3>
                    <p>{role}</p>
                    <div className="agent-card-bottom">
                      <span /> Specialist agent
                    </div>
                  </div>
                ))}
              </div>
              <div className="greeting">
                <div className="bot-avatar">
                  <Layers3 size={17} />
                </div>
                <div>
                  <div className="message-label">
                    Patchwork <span>Review orchestrator</span>
                  </div>
                  <div className="bubble">
                    Hey there! 👋 Ready when you are. Drop in a ZIP file or
                    paste a public GitHub repository URL. I’ll bring the team
                    together and turn our findings into a clear, prioritized
                    review.
                  </div>
                </div>
              </div>
              <div className="quick-actions">
                <button
                  onClick={() => fileInput.current?.click()}
                  disabled={busy}
                >
                  <FileArchive size={15} /> Upload a ZIP{" "}
                  <ArrowUpRight size={13} />
                </button>
                <button
                  onClick={() => {
                    urlInput.current?.focus();
                    setUrl("https://github.com/");
                  }}
                  disabled={busy}
                >
                  <Github size={15} /> Connect a repository{" "}
                  <ArrowUpRight size={13} />
                </button>
              </div>
            </div>
          ) : (
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
                  Submitted for review <Check size={12} />
                </span>
              </div>
              <div className="assistant-message">
                <div className="bot-avatar">
                  <Layers3 size={17} />
                </div>
                <div className="assistant-content">
                  <div className="message-label">
                    Patchwork <span>Review orchestrator</span>
                  </div>
                  <div className="bubble">
                    I’ve got your code. The team is checking for bugs, security
                    risks, and missing tests in parallel.
                  </div>
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
                        {states[id] === "running" &&
                        current.status === "running" ? (
                          <LoaderCircle className="spin" size={14} />
                        ) : states[id] === "complete" ? (
                          <Check size={14} className="green" />
                        ) : (
                          <span className="waiting-dot" />
                        )}
                      </div>
                    ))}
                    <div className="progress-note" role="status">
                      {latest?.message ||
                        (current.report
                          ? "Report assembled and prioritized."
                          : "Connecting to your review…")}
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
                  {current.status === "error" && (
                    <div className="error" role="alert">
                      {latest?.message}
                      <button
                        onClick={() => {
                          setActiveId(null);
                          if (!current.source.endsWith(".zip"))
                            setUrl(current.source);
                          setFocus(current.focus);
                        }}
                      >
                        Start again <ArrowUpRight size={14} />
                      </button>
                    </div>
                  )}
                  {current.report && (
                    <Report report={current.report} id={current.id} />
                  )}
                </div>
              </div>
            </div>
          )}
          <div ref={bottom} />
        </div>
        <div className="composer-area">
          {busy && !current && (
            <button
              className="running-banner"
              onClick={() => running && setActiveId(running.id)}
            >
              <LoaderCircle size={14} className="spin" />{" "}
              {submitting
                ? "Uploading your source…"
                : "A review is in progress. View live updates."}
            </button>
          )}
          {error && (
            <div className="error input-error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          <form
            className={`composer ${dragging ? "dragging" : ""}`}
            onSubmit={submit}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!busy) chooseFile(e.dataTransfer.files[0]);
            }}
          >
            {file ? (
              <div className="file-chip">
                <FileArchive size={17} />
                <span>
                  {file.name}
                  <small>{(file.size / 1024).toFixed(1)} KB</small>
                </span>
                <button
                  type="button"
                  aria-label="Remove file"
                  onClick={() => setFile(null)}
                  disabled={busy}
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <input
                ref={urlInput}
                aria-label="Public GitHub repository URL"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste a GitHub URL, or drop your ZIP file here…"
                disabled={busy}
                maxLength={500}
              />
            )}
            <input
              className="focus-input"
              aria-label="Optional review focus"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="Anything we should focus on? (optional)"
              maxLength={2000}
              disabled={busy}
            />
            <div className="composer-toolbar">
              <div>
                <button
                  className="attach"
                  type="button"
                  aria-label="Attach ZIP file"
                  onClick={() => fileInput.current?.click()}
                  disabled={busy}
                >
                  <Paperclip size={18} />
                </button>
                <span className="toolbar-divider" />
                <span className="team-label">
                  <span /> 3 agents · 1 review
                </span>
              </div>
              <button
                className="send"
                type="submit"
                aria-label="Start code review"
                disabled={busy || (!file && !url.trim())}
              >
                {submitting ? (
                  <LoaderCircle size={19} className="spin" />
                ) : (
                  <ArrowUp size={21} />
                )}
              </button>
            </div>
          </form>
          <input
            type="file"
            accept=".zip,application/zip"
            hidden
            ref={fileInput}
            onChange={(e) => {
              chooseFile(e.target.files[0]);
              e.target.value = "";
            }}
          />
          <p className="composer-caption">
            ZIP up to 20 MB <span>·</span> Public GitHub repos <span>·</span>{" "}
            Source is sent to the configured AI provider
          </p>
        </div>
      </main>
    </div>
  );
}

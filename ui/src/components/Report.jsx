import { useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Download } from "lucide-react";

function githubFileUrl(source, file, line) {
  const match = source?.match(
    /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9_.-]+)\/?$/,
  );
  if (!match) return null;
  const repo = match[2].replace(/\.git$/, "");
  if (!repo || repo === "." || repo === "..") return null;
  // GitHub ZIP downloads wrap all files in a repository root directory.
  const parts = file.split("/").slice(1);
  if (!parts.length || parts.some((part) => !part || part === "." || part === "..")) return null;
  const path = parts.map(encodeURIComponent).join("/");
  return `https://github.com/${match[1]}/${repo}/blob/HEAD/${path}#L${line}`;
}

export default function Report({ report, id, source }) {
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
          href={`/api/reviews/${id}/report?format=docx`}
          title="Download Word document report"
          aria-label="Download Word document report"
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
            type="button"
            className={`severity-tile severity-tile-${level} ${filter === level ? "selected" : ""}`}
            aria-pressed={filter === level}
            onClick={() => setFilter(level)}
          >
            <span className="severity-tile-label">{level}</span>
            <span className="severity-tile-count">
              {level === "all"
                ? report.findings.length
                : report.findings.filter((f) => f.severity === level).length}
            </span>
          </button>
        ))}
      </div>
      <div className="findings">
        {findings.length ? (
          findings.map((f, i) => {
            const fileUrl = githubFileUrl(source, f.file, f.line);
            return (
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
                    {fileUrl ? (
                      <a
                        className="finding-file-link"
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open file on GitHub in a new tab"
                        aria-label={`Open ${f.file}, line ${f.line}, on GitHub in a new tab`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {f.file}:{f.line} <ArrowUpRight size={13} aria-hidden="true" />
                      </a>
                    ) : (
                      <>{f.file}:{f.line}</>
                    )}
                  </small>
                </span>
                <span className="category">{f.category}</span>
                <ChevronDown size={16} />
              </summary>
              <div className="finding-body">
                <p>{f.explanation}</p>
                <h4>Suggested next step</h4>
                <p>{f.recommendation}</p>
              </div>
            </details>
            );
          })
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

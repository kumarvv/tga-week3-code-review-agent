import { useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Download } from "lucide-react";

export default function Report({ report, id }) {
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

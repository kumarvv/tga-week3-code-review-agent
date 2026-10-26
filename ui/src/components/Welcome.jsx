import {
  ArrowUpRight,
  Code2,
  FileArchive,
  Github,
  Layers3,
  Sparkles,
} from "lucide-react";
import { specialists } from "./specialists";

export default function Welcome({ busy, fileInput, urlInput, setUrl }) {
  return (
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
        <br className="desktop-break" /> and let three specialist agents take a
        closer look.
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
            CodeScanner <span>Review orchestrator</span>
          </div>
          <div className="bubble">
            Hey there! 👋 Ready when you are. Drop in a ZIP file or paste a
            public GitHub repository URL. I’ll bring the team together and turn
            our findings into a clear, prioritized review.
          </div>
        </div>
      </div>
      <div className="quick-actions">
        <button onClick={() => fileInput.current?.click()} disabled={busy}>
          <FileArchive size={15} /> Upload a ZIP <ArrowUpRight size={13} />
        </button>
        <button
          onClick={() => {
            urlInput.current?.focus();
            setUrl("https://github.com/");
          }}
          disabled={busy}
        >
          <Github size={15} /> Connect a repository <ArrowUpRight size={13} />
        </button>
      </div>
    </div>
  );
}

import { Code2 } from "lucide-react";

export default function Header({ health }) {
  return (
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
  );
}

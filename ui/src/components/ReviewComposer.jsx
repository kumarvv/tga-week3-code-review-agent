import { ArrowUp, FileArchive, LoaderCircle, Paperclip, X } from "lucide-react";

export default function ReviewComposer({
  busy,
  current,
  running,
  setActiveId,
  submitting,
  error,
  setError,
  dragging,
  setDragging,
  submit,
  chooseFile,
  file,
  setFile,
  urlInput,
  url,
  setUrl,
  focus,
  setFocus,
  fileInput,
}) {
  return (
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
        ZIP up to 20 MB <span>·</span> Public GitHub repos <span>·</span> Source
        is sent to the configured AI provider
      </p>
    </div>
  );
}

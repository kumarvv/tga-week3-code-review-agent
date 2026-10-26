import { useEffect, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Welcome from "./components/Welcome";
import ReviewThread from "./components/ReviewThread";
import ReviewComposer from "./components/ReviewComposer";

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
      <Sidebar
        current={current}
        reviews={reviews}
        activeId={activeId}
        setActiveId={setActiveId}
        setError={setError}
        urlInput={urlInput}
      />
      <main>
        <Header health={health} />
        <div className="conversation">
          {!current ? (
            <Welcome
              busy={busy}
              fileInput={fileInput}
              urlInput={urlInput}
              setUrl={setUrl}
            />
          ) : (
            <ReviewThread
              current={current}
              states={states}
              latest={latest}
              setActiveId={setActiveId}
              setUrl={setUrl}
              setFocus={setFocus}
            />
          )}
          <div ref={bottom} />
        </div>
        <ReviewComposer
          busy={busy}
          current={current}
          running={running}
          setActiveId={setActiveId}
          submitting={submitting}
          error={error}
          setError={setError}
          dragging={dragging}
          setDragging={setDragging}
          submit={submit}
          chooseFile={chooseFile}
          file={file}
          setFile={setFile}
          urlInput={urlInput}
          url={url}
          setUrl={setUrl}
          focus={focus}
          setFocus={setFocus}
          fileInput={fileInput}
        />
      </main>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  GraduationCap,
  Lightbulb,
  LoaderCircle,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
  Target,
  Trash2,
  Upload,
  X,
} from "lucide-react";

// Use Vite's same-origin API proxy by default. Browser previews may forward
// the UI port without making arbitrary localhost ports reachable.
const API = (import.meta.env.VITE_API_URL || "http://localhost:8001").replace(
  /\/$/,
  "",
);
const examples = [
  "Explain the main idea in simple terms",
  "What should I remember for an exam?",
  "How does this topic connect to the next one?",
];

async function request(path, body) {
  const res = await fetch(
    `${API}${path}`,
    body instanceof FormData
      ? { method: "POST", body }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(data.detail || "Something went wrong. Please try again.");
  return data;
}

function App() {
  const [doc, setDoc] = useState(null);
  const [tab, setTab] = useState("chat");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [apiReady, setApiReady] = useState(null);
  const [topic, setTopic] = useState("");
  const [summary, setSummary] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [answer, setAnswer] = useState({});
  const [revealed, setRevealed] = useState(false);
  const [difficulty, setDifficulty] = useState("balanced");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/health`)
      .then((r) => r.json())
      .then((d) => setApiReady(d.groq_configured))
      .catch(() => setApiReady(false));
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);

  async function upload(file) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await request("/api/documents", form);
      setDoc(data);
      setMessages([
        {
          role: "assistant",
          content: `I’ve explored **${data.name}** — ${data.pages} pages, ready to go. Ask me anything, or choose a study tool to get started.`,
          sources: [],
        },
      ]);
      setSummary(null);
      setQuiz(null);
      setAnswer({});
      setTab("chat");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function ask(text = draft) {
    if (!doc || !text.trim() || busy) return;
    const question = text.trim(),
      next = [...messages, { role: "user", content: question }];
    setMessages(next);
    setDraft("");
    setError("");
    setBusy(true);
    try {
      const data = await request("/api/ask", {
        document_id: doc.id,
        question,
        history: messages
          .slice(-8)
          .map(({ role, content }) => ({ role, content })),
      });
      setMessages([
        ...next,
        { role: "assistant", content: data.answer, sources: data.sources },
      ]);
    } catch (e) {
      setError(e.message);
      setMessages(next);
    } finally {
      setBusy(false);
    }
  }

  async function makeSummary() {
    setBusy(true);
    setError("");
    setSummary(null);
    try {
      setSummary(
        await request("/api/summary", {
          document_id: doc.id,
          topic: topic.trim() || null,
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function makeQuiz() {
    setBusy(true);
    setError("");
    setQuiz(null);
    setAnswer({});
    setRevealed(false);
    try {
      setQuiz(
        await request("/api/quiz", {
          document_id: doc.id,
          topic: topic.trim() || null,
          count: 8,
          difficulty,
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeDoc() {
    if (doc)
      fetch(`${API}/api/documents/${doc.id}`, { method: "DELETE" }).catch(
        () => {},
      );
    setDoc(null);
    setMessages([]);
    setSummary(null);
    setQuiz(null);
    setError("");
    setTab("chat");
  }

  const score = quiz
    ? quiz.questions.reduce(
        (n, q, i) => n + (answer[i] === q.answer ? 1 : 0),
        0,
      )
    : 0;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top">
          <span className="brand-mark">
            <Sparkles size={17} />
          </span>
          <span>
            studyflow<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="side-label">YOUR SPACE</div>
        <button className="nav-item active">
          <span className="nav-icon">
            <BookOpen size={17} />
          </span>
          Study room
          <span className="nav-pip" />
        </button>
        <div className="side-label material-label">STUDY MATERIAL</div>
        {doc ? (
          <div className="file-card">
            <span className="pdf-icon">
              <FileText size={17} />
            </span>
            <div className="file-details">
              <span className="file-name" title={doc.name}>
                {doc.name}
              </span>
              <span className="file-pages">{doc.pages} pages · ready</span>
            </div>
            <button
              className="icon-button remove-file"
              title="Remove PDF"
              onClick={removeDoc}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ) : (
          <button
            className="add-material"
            onClick={() => inputRef.current?.click()}
          >
            <span className="add-icon">
              <Plus size={16} />
            </span>
            <span>Add your first PDF</span>
          </button>
        )}
        <div className="sidebar-note">
          <div className="note-icon">
            <Lightbulb size={15} />
          </div>
          <p>A little study, often, goes a long way.</p>
          <span>You're doing great. Keep going.</span>
        </div>
        <div className="profile">
          <div className="avatar">S</div>
          <div className="profile-text">
            <strong>My study space</strong>
            <span>Learning at your pace</span>
          </div>
          <ChevronDown size={15} />
        </div>
      </aside>

      <main className="main-panel" id="top">
        <header className="topbar">
          <div className="crumb">
            <span>My space</span>
            <ChevronRight size={14} />
            <strong>Study room</strong>
          </div>
          <div className="top-right">
            <span className="privacy">
              <span />
              Your materials stay private
            </span>
            <span className="top-avatar">S</span>
          </div>
        </header>
        <div className="workspace">
          <div className="welcome-row">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" />
                YOUR PERSONAL STUDY SPACE
              </div>
              <h1>
                Make room for <span>the “aha.”</span>
              </h1>
              <p className="subtitle">
                A calm space to understand more and remember longer.
              </p>
            </div>
            <div className="welcome-doodle">
              <div className="doodle-orbit orbit-a" />
              <div className="doodle-orbit orbit-b" />
              <div className="doodle-center">
                <Brain size={27} />
              </div>
              <Sparkles className="doodle-spark" size={17} />
            </div>
          </div>

          <div className="tool-grid">
            <button
              className={`tool-card ${tab === "chat" ? "tool-selected" : ""}`}
              onClick={() => setTab("chat")}
            >
              <span className="tool-icon chat-color">
                <MessageCircle size={17} />
              </span>
              <span className="tool-copy">
                <strong>Ask & understand</strong>
                <span>Your notes, in a conversation</span>
              </span>
              <ChevronRight className="tool-arrow" size={16} />
            </button>
            <button
              className={`tool-card ${tab === "summary" ? "tool-selected" : ""}`}
              onClick={() => setTab("summary")}
            >
              <span className="tool-icon summary-color">
                <BookOpen size={17} />
              </span>
              <span className="tool-copy">
                <strong>Topic summaries</strong>
                <span>Big ideas, made clear</span>
              </span>
              <ChevronRight className="tool-arrow" size={16} />
            </button>
            <button
              className={`tool-card ${tab === "quiz" ? "tool-selected" : ""}`}
              onClick={() => setTab("quiz")}
            >
              <span className="tool-icon quiz-color">
                <Target size={17} />
              </span>
              <span className="tool-copy">
                <strong>Practice quiz</strong>
                <span>Find out what you know</span>
              </span>
              <ChevronRight className="tool-arrow" size={16} />
            </button>
          </div>

          <section className="study-card">
            <div className="study-card-head">
              <div className="card-title-wrap">
                <span className="card-title-icon">
                  {tab === "chat" ? (
                    <MessageCircle size={17} />
                  ) : tab === "summary" ? (
                    <BookOpen size={17} />
                  ) : (
                    <Target size={17} />
                  )}
                </span>
                <div>
                  <h2>
                    {tab === "chat"
                      ? "Ask your study buddy"
                      : tab === "summary"
                        ? "A clearer view of the topic"
                        : "A little practice goes a long way"}
                  </h2>
                  <span className="card-subtitle">
                    {tab === "chat"
                      ? "Answers grounded in your uploaded material"
                      : tab === "summary"
                        ? "A focused summary to help it all click"
                        : "A quick check-in to make learning stick"}
                  </span>
                </div>
              </div>
              <span className="online-pill">
                <span />
                READY WHEN YOU ARE
              </span>
            </div>

            {!doc ? (
              <div
                className={`upload-zone ${dragging ? "dragging" : ""} ${busy ? "uploading" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  upload(e.dataTransfer.files?.[0]);
                }}
                onClick={() => !busy && inputRef.current?.click()}
                role="button"
                tabIndex="0"
                onKeyDown={(e) =>
                  e.key === "Enter" && inputRef.current?.click()
                }
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  hidden
                  onChange={(e) => upload(e.target.files?.[0])}
                />
                <div className="upload-art">
                  <div className="upload-file">
                    <FileText size={25} />
                    <span>PDF</span>
                  </div>
                  <span className="upload-star star-one">✳</span>
                  <span className="upload-star star-two">✦</span>
                </div>
                {busy ? (
                  <>
                    <h3>Getting your notes ready...</h3>
                    <p>Finding the ideas worth remembering.</p>
                    <LoaderCircle
                      className="spinner upload-spinner"
                      size={17}
                    />
                  </>
                ) : (
                  <>
                    <h3>Start with what you're learning</h3>
                    <p>Drop in a PDF and we'll make it easier to explore.</p>
                    <button
                      className="primary-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        inputRef.current?.click();
                      }}
                    >
                      <Upload size={15} /> Choose a PDF
                    </button>
                    <div className="upload-foot">
                      <span>PDF files</span>
                      <i />
                      <span>Up to 20 MB</span>
                      <i />
                      <span>Up to 500 pages</span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                {tab === "chat" && (
                  <div className="chat-body">
                    <div className="chat-topline">
                      <span>
                        <span className="ready-dot" />
                        Studying <strong>{doc.name}</strong>
                      </span>
                      <button className="quiet-button" onClick={removeDoc}>
                        <X size={14} /> Change PDF
                      </button>
                    </div>
                    <div className="message-list">
                      {messages.length === 1 && (
                        <div className="starter">
                          <div className="starter-mark">
                            <Sparkles size={17} />
                          </div>
                          <h3>Every good question starts somewhere.</h3>
                          <p>
                            Try one of these, or ask whatever is on your mind.
                          </p>
                          <div className="example-list">
                            {examples.map((x) => (
                              <button key={x} onClick={() => ask(x)}>
                                {x}
                                <ChevronRight size={14} />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {messages.map((m, i) => (
                        <div key={i} className={`message-row ${m.role}`}>
                          <div className={`message-avatar ${m.role}`}>
                            {m.role === "assistant" ? (
                              <Sparkles size={14} />
                            ) : (
                              "S"
                            )}
                          </div>
                          <div className="message-content">
                            <span className="message-name">
                              {m.role === "assistant" ? "Study buddy" : "You"}
                            </span>
                            <div className="bubble">
                              {m.content.split(/\n/).map((line, j) => (
                                <p key={j}>
                                  {line
                                    .split(/(\*\*.*?\*\*)/g)
                                    .map((piece, k) =>
                                      piece.startsWith("**") &&
                                      piece.endsWith("**") ? (
                                        <strong key={k}>
                                          {piece.slice(2, -2)}
                                        </strong>
                                      ) : (
                                        piece
                                      ),
                                    )}
                                </p>
                              ))}
                            </div>
                            {m.sources?.length > 0 && (
                              <span className="source-tag">
                                <FileText size={12} /> From{" "}
                                {m.sources.map((n) => `p. ${n}`).join(", ")}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                      {busy && (
                        <div className="message-row assistant">
                          <div className="message-avatar assistant">
                            <Sparkles size={14} />
                          </div>
                          <div className="typing">
                            <i />
                            <i />
                            <i />
                          </div>
                        </div>
                      )}
                      <div ref={endRef} />
                    </div>
                    <div className="composer-wrap">
                      <div className="composer">
                        <input
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) =>
                            e.key === "Enter" && !e.shiftKey && ask()
                          }
                          placeholder="Ask a question about your study material..."
                          disabled={busy}
                        />
                        <button
                          className="send-button"
                          onClick={() => ask()}
                          disabled={!draft.trim() || busy}
                          aria-label="Send question"
                        >
                          {busy ? (
                            <LoaderCircle className="spinner" size={17} />
                          ) : (
                            <Send size={17} />
                          )}
                        </button>
                      </div>
                      <div className="composer-hint">
                        <Sparkles size={12} /> Answers are based on your PDF and
                        include page references
                      </div>
                    </div>
                  </div>
                )}

                {tab === "summary" && (
                  <div className="tool-body">
                    <label className="input-label" htmlFor="topic-summary">
                      WHAT WOULD YOU LIKE TO FOCUS ON?
                    </label>
                    <div className="topic-row">
                      <div className="topic-input">
                        <BookOpen size={16} />
                        <input
                          id="topic-summary"
                          value={topic}
                          onChange={(e) => setTopic(e.target.value)}
                          placeholder="A chapter, concept, or leave blank for everything"
                          onKeyDown={(e) => e.key === "Enter" && makeSummary()}
                        />
                      </div>
                      <button
                        className="primary-button generate"
                        disabled={busy}
                        onClick={makeSummary}
                      >
                        {busy ? (
                          <LoaderCircle className="spinner" size={15} />
                        ) : (
                          <Sparkles size={15} />
                        )}{" "}
                        Make my summary
                      </button>
                    </div>
                    {error && (
                      <div className="error-box">
                        <CircleHelp size={15} />
                        {error}
                      </div>
                    )}
                    {summary ? (
                      <div className="result-panel">
                        <div className="result-heading">
                          <span className="result-icon summary-color">
                            <BookOpen size={17} />
                          </span>
                          <div>
                            <span className="result-overline">
                              YOUR STUDY NOTES
                            </span>
                            <h3>{summary.topic || "The big picture"}</h3>
                          </div>
                        </div>
                        <div className="result-text">
                          {summary.summary
                            .split("\n")
                            .filter(Boolean)
                            .map((line, i) => (
                              <p key={i}>{line}</p>
                            ))}
                        </div>
                        <div className="result-footer">
                          <FileText size={13} /> Drawn from pages{" "}
                          {summary.sources.join(", ")}
                        </div>
                      </div>
                    ) : (
                      !busy && (
                        <div className="empty-tool">
                          <div className="empty-illustration">
                            <BookOpen size={24} />
                            <Sparkles size={14} />
                          </div>
                          <h3>See the shape of what you're learning</h3>
                          <p>
                            Get the big picture, key ideas, and a few things to
                            keep in mind.
                          </p>
                        </div>
                      )
                    )}
                  </div>
                )}

                {tab === "quiz" && (
                  <div className="tool-body">
                    <label className="input-label" htmlFor="topic-quiz">
                      CHOOSE A TOPIC <span>OPTIONAL</span>
                    </label>
                    <div className="topic-row">
                      <div className="topic-input">
                        <Target size={16} />
                        <input
                          id="topic-quiz"
                          value={topic}
                          onChange={(e) => setTopic(e.target.value)}
                          placeholder="e.g. Cell division, chapter 3, or leave blank"
                        />
                      </div>
                      <select
                        className="difficulty"
                        value={difficulty}
                        onChange={(e) => setDifficulty(e.target.value)}
                        aria-label="Quiz difficulty"
                      >
                        <option value="gentle">Gentle</option>
                        <option value="balanced">Balanced</option>
                        <option value="stretch">Stretch</option>
                      </select>
                      <button
                        className="primary-button generate"
                        disabled={busy}
                        onClick={makeQuiz}
                      >
                        {busy ? (
                          <LoaderCircle className="spinner" size={15} />
                        ) : (
                          <Sparkles size={15} />
                        )}{" "}
                        Create quiz
                      </button>
                    </div>
                    {error && (
                      <div className="error-box">
                        <CircleHelp size={15} />
                        {error}
                      </div>
                    )}
                    {quiz ? (
                      <div className="quiz-panel">
                        <div className="quiz-heading">
                          <div>
                            <span className="result-overline">
                              PRACTICE SET
                            </span>
                            <h3>{quiz.title}</h3>
                          </div>
                          <span className="quiz-progress">
                            <Clock3 size={14} /> {Object.keys(answer).length} /{" "}
                            {quiz.questions.length} answered
                          </span>
                        </div>
                        {quiz.questions.map((q, i) => (
                          <div className="question-card" key={i}>
                            <div className="question-meta">
                              <span>
                                QUESTION {String(i + 1).padStart(2, "0")}
                              </span>
                              <span>PAGE {q.page}</span>
                            </div>
                            <h4>{q.question}</h4>
                            <div className="options">
                              {q.options.map((option, oi) => {
                                const picked = answer[i] === oi,
                                  correct = q.answer === oi;
                                return (
                                  <button
                                    key={oi}
                                    className={`option ${picked ? "picked" : ""} ${revealed && correct ? "correct" : ""} ${revealed && picked && !correct ? "incorrect" : ""}`}
                                    disabled={revealed}
                                    onClick={() =>
                                      setAnswer({ ...answer, [i]: oi })
                                    }
                                  >
                                    <span className="option-letter">
                                      {String.fromCharCode(65 + oi)}
                                    </span>
                                    {option}
                                    {revealed && correct && (
                                      <Check
                                        className="option-check"
                                        size={15}
                                      />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                            {revealed && (
                              <div className="explanation">
                                <Lightbulb size={15} />
                                <span>{q.explanation}</span>
                              </div>
                            )}
                          </div>
                        ))}
                        <div className="quiz-actions">
                          {revealed ? (
                            <>
                              <span className="score-text">
                                You got{" "}
                                <strong>
                                  {score} of {quiz.questions.length}
                                </strong>{" "}
                                —{" "}
                                {score === quiz.questions.length
                                  ? "wonderfully done!"
                                  : "every question is a chance to grow."}
                              </span>
                              <button
                                className="secondary-button"
                                onClick={makeQuiz}
                              >
                                Try another <Sparkles size={14} />
                              </button>
                            </>
                          ) : (
                            <button
                              className="primary-button"
                              disabled={
                                Object.keys(answer).length <
                                quiz.questions.length
                              }
                              onClick={() => setRevealed(true)}
                            >
                              Check my answers <ChevronRight size={15} />
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      !busy && (
                        <div className="empty-tool quiz-empty">
                          <div className="empty-illustration quiz-illustration">
                            <Target size={24} />
                            <span>?</span>
                          </div>
                          <h3>Practice makes the ideas yours</h3>
                          <p>
                            Build a thoughtful quiz from the material you've
                            uploaded.
                          </p>
                          <div className="quiz-promise">
                            <span>
                              <Check size={13} /> Questions grounded in your
                              notes
                            </span>
                            <span>
                              <Check size={13} /> Answers explained with page
                              references
                            </span>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </>
            )}
            {error && tab === "chat" && (
              <div className="inline-error">
                <CircleHelp size={14} />
                {error}
              </div>
            )}
          </section>
          <div className="bottom-note">
            <GraduationCap size={16} />
            <span>Little by little, a little becomes a lot.</span>
            <i>— Tanzanian proverb</i>
            <span className="bottom-status">
              <span className={apiReady ? "status-on" : ""} />
              {apiReady === null
                ? "Connecting"
                : apiReady
                  ? "AI tutor connected"
                  : "Add your Groq key to get started"}
            </span>
          </div>
          <footer>
            <span>Made for curious minds</span>
            <span className="footer-spark">✳</span>
            <span>One page at a time</span>
            <span className="footer-help">
              <CircleHelp size={13} /> Need help getting started?
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;

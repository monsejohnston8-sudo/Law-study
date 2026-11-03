"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  LayoutDashboard,
  Search,
  Upload,
  Settings,
  ArrowUpRight,
  ChevronRight,
  Check,
  Clock,
  Layers,
  Scale,
  Plus,
  FileText,
  Sun,
  Moon,
  Menu,
  X,
} from "lucide-react";
import { essayMarkdown } from "@/lib/study";
import AIStudyPanel from "./ai-study-panel";
// Server DTOs include heterogeneous editorial model fields.
type Row = Record<string, any>;
type Module = Row & {
  id: string;
  number: number;
  title: string;
  courseId: string;
};
type Course = { id: string; title: string; modules: Module[]; sources: Row[] };
type State = {
  courses: Course[];
  sessions: Row[];
  attempts: Row[];
  reviews: Row[];
  preferences: Row | null;
};
const tabs = [
  "Overview",
  "Assigned Readings",
  "Rules & Elements",
  "Cases",
  "Notes",
  "Flashcards",
  "Practice Questions",
  "IRAC Essays",
  "Seminar & Quiz Feedback",
  "Sources",
  "Mini Module Exam",
];
const kinds: Record<string, string> = {
  "Rules & Elements": "rule",
  Cases: "caseBrief",
  Notes: "note",
  Flashcards: "flashcard",
  "Practice Questions": "mCQ",
  "IRAC Essays": "essayPrompt",
  "Seminar & Quiz Feedback": "note",
};
const collections: Record<string, string> = {
  rule: "rules",
  caseBrief: "cases",
  note: "notes",
  flashcard: "flashcards",
  mCQ: "mcqs",
  essayPrompt: "essays",
};
const extraFields: Record<string, string[]> = {
  note: ["kind"],
  rule: [
    "jurisdiction",
    "elements",
    "exceptions",
    "standardOfReview",
    "policy",
    "examples",
    "counterarguments",
  ],
  caseBrief: [
    "citation",
    "facts",
    "posture",
    "issue",
    "holding",
    "reasoning",
    "rule",
    "dissent",
    "significance",
  ],
  flashcard: ["answer"],
  mCQ: ["topic", "difficulty"],
  essayPrompt: ["facts", "issueTags", "modelAnswer", "rubric", "difficulty"],
};
const label = (s: string) =>
  s.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
async function api(path: string, body?: unknown) {
  if (typeof window !== "undefined" && window.casebookTransport)
    return window.casebookTransport(path, body);
  const r = await fetch(
    `/api/${path}`,
    body instanceof FormData
      ? { method: "POST", body }
      : body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
function download(name: string, value: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function Badge({ children }: { children: React.ReactNode }) {
  return <span className="badge">{children}</span>;
}
export default function Workspace() {
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    const update = () => setUpdateReady(!!window.casebookUpdateAvailable);
    update();
    window.addEventListener("casebook-update-ready", update);
    return () => window.removeEventListener("casebook-update-ready", update);
  }, []);
  const [data, setData] = useState<State | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [view, setView] = useState("dashboard"),
    [courseId, setCourse] = useState(""),
    [moduleId, setModule] = useState(""),
    [tab, setTab] = useState("Overview"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [moduleFilter, setModuleFilter] = useState(""),
    [editor, setEditor] = useState<Row | null>(null),
    [aiSelection, setAISelection] = useState<Row | null>(null),
    [study, setStudy] = useState<Module | null>(null),
    [exam, setExam] = useState<Module | null>(null),
    [essay, setEssay] = useState<Row | null>(null),
    [mobile, setMobile] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const d = await api("state");
      setData(d);
      document.documentElement.dataset.theme = d.preferences?.theme ?? "light";
    } catch (e) {
      setError(String(e));
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const courses = data?.courses ?? [],
    modules = courses.flatMap((c) => c.modules),
    course = courses.find((c) => c.id === courseId),
    module = modules.find((m) => m.id === moduleId);
  const navigate = (v: string, c = "", m = "") => {
    setView(v);
    setCourse(c);
    setModule(m);
    setTab("Overview");
    setMobile(false);
    setError("");
  };
  async function perform(path: string, body: unknown, message = "Saved") {
    try {
      const r = await api(path, body);
      await refresh();
      setNotice(message);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }
  async function edit(kind: string, m: Module, item?: Row) {
    try {
      const row = item?.id ? await api(`item?kind=${kind}&id=${item.id}`) : {};
      setEditor({
        moduleId: m.id,
        status: "needs_review",
        title: "",
        body: "",
        ...row,
        kind,
        noteKind: row.kind ?? "notes",
      });
    } catch (e) {
      setError(String(e));
    }
  }
  const verifiedCards = modules
      .flatMap((m) => m.flashcards)
      .filter((c) => c.answer && c.status === "verified"),
    due = verifiedCards.filter((c) => new Date(c.due) <= new Date()),
    done = modules.filter((m) => m.mastery?.completed).length;
  const continueModule =
    modules.find((m) => m.id === data?.sessions[0]?.moduleId) ||
    modules.find((m) => !m.mastery?.completed);
  const accuracy = (m: Module) => {
    const ids = new Set(m.mcqs.map((q: Row) => q.id)),
      attempts = data?.attempts.filter((a) => ids.has(a.mcqId)) ?? [];
    return attempts.length
      ? `${Math.round((100 * attempts.filter((a) => a.correct).length) / attempts.length)}%`
      : "—";
  };
  const sources = courses.flatMap((c) => c.sources);
  const libraryModule = (m: Module) => ({
    ...m,
    sources: sources.filter(
      (s) => s.courseId === m.courseId && (!s.moduleId || s.moduleId === m.id),
    ),
  });
  const reviewItems = modules.flatMap((m) =>
    Object.entries(collections).flatMap(([kind, key]) =>
      m[key]
        .filter((r: Row) => r.status === "needs_review")
        .map((r: Row) => ({ ...r, kind, module: m })),
    ),
  );
  return (
    <div className="shell">
      <aside className={mobile ? "open" : ""}>
        <div className="brand">
          <div className="brand-icon">
            <Scale size={21} />
          </div>
          <h1>
            Casebook<span>A LITTLE PROGRESS, EVERY DAY</span>
          </h1>
        </div>
        <button
          className={view === "dashboard" ? "active" : ""}
          onClick={() => navigate("dashboard")}
        >
          <LayoutDashboard size={17} />
          Dashboard
        </button>
        <button
          className={view === "search" ? "active" : ""}
          onClick={() => navigate("search")}
        >
          <Search size={17} />
          Search library
        </button>
        <p className="nav-label">YOUR COURSES</p>
        {courses.map((c, i) => (
          <button
            className={courseId === c.id ? "active" : ""}
            key={c.id}
            onClick={() => navigate("course", c.id)}
          >
            <span className={`course-dot tone-${i}`} />
            <span>
              <small>{c.id}</small>
              {c.title}
            </span>
          </button>
        ))}
        <p className="nav-label">YOUR WORKSPACE</p>
        <button
          className={view === "analytics" ? "active" : ""}
          onClick={() => navigate("analytics")}
        >
          <Clock size={17} />
          Study insights
        </button>
        <button
          className={view === "import" ? "active" : ""}
          onClick={() => navigate("import")}
        >
          <Upload size={17} />
          Import sources
        </button>
        <button
          className={view === "review" ? "active" : ""}
          onClick={() => navigate("review")}
        >
          <Check size={17} />
          Review queue <span className="count">{reviewItems.length}</span>
        </button>
        <button
          className={view === "settings" ? "active" : ""}
          onClick={() => navigate("settings")}
        >
          <Settings size={17} />
          Settings & backup
        </button>
        <div className="sidebar-bottom">
          <span className="privacy-dot" />{" "}
          {typeof window !== "undefined" && window.casebookTransport
            ? "Stored on this device"
            : "Stored on this device’s server"}
          <p>Private by default. Built for your study.</p>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <button
              className="icon mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={19} />
            </button>
            <span>YOUR PERSONAL STUDY SPACE</span>
          </div>
          <div className="header-right">
            <span className="local">
              <span className="privacy-dot" />
              Local & private
            </span>
            <button
              className="icon"
              aria-label="Toggle theme"
              onClick={() =>
                perform("preferences", {
                  theme: data?.preferences?.theme === "dark" ? "light" : "dark",
                  dailyGoal: data?.preferences?.dailyGoal ?? 20,
                }).catch(() => {})
              }
            >
              {data?.preferences?.theme === "dark" ? (
                <Sun size={18} />
              ) : (
                <Moon size={18} />
              )}
            </button>
            <span className="avatar">LS</span>
          </div>
        </header>
        {updateReady && (
          <div className="success" role="status">
            A new version is ready. Save open work, then update.
            <button onClick={() => window.casebookApplyUpdate?.()}>
              Update app
            </button>
          </div>
        )}
        {error && (
          <div className="alert" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="success" role="status">
            {notice}
            <button
              onClick={() => setNotice("")}
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {!data ? (
          <div className="card loading">Loading your library…</div>
        ) : (
          <>
            {view === "dashboard" && (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">MAKE ROOM FOR WHAT’S NEXT</p>
                    <h2>A little progress. Every day.</h2>
                    <p className="muted">
                      Pick up where you left off. Your next breakthrough starts
                      here.
                    </p>
                  </div>
                  <button
                    className="outline"
                    onClick={() => navigate("import")}
                  >
                    <Plus size={16} />
                    Import materials
                  </button>
                </div>
                {typeof window !== "undefined" && window.casebookTransport && (
                  <div className="phone-install source-banner">
                    <BookOpen size={20} />
                    <p>
                      <strong>Take Casebook with you.</strong>In Safari, tap
                      Share, then Add to Home Screen. Import your private study
                      ZIP in Settings & backup.
                    </p>
                  </div>
                )}
                <div className="stats">
                  <div>
                    <span className="stat-icon">
                      <BookOpen size={19} />
                    </span>
                    <div>
                      <strong>
                        3 <small>courses</small>
                      </strong>
                      <p>Your semester, organized</p>
                    </div>
                  </div>
                  <div>
                    <span className="stat-icon">
                      <Check size={19} />
                    </span>
                    <div>
                      <strong>
                        {done}
                        <small> / 45 modules</small>
                      </strong>
                      <p>Marked complete by you</p>
                    </div>
                  </div>
                  <div>
                    <span className="stat-icon">
                      <Layers size={19} />
                    </span>
                    <div>
                      <strong>
                        {due.length}
                        <small> due for review</small>
                      </strong>
                      <p>Build lasting understanding</p>
                    </div>
                  </div>
                  <div>
                    <span className="stat-icon">
                      <Clock size={19} />
                    </span>
                    <div>
                      <strong>
                        {data.sessions.length}
                        <small> recent sessions</small>
                      </strong>
                      <p>One step at a time</p>
                    </div>
                  </div>
                </div>
                <div className="section-heading">
                  <h3>Your courses</h3>
                  <span>THREE COURSES. ONE CLEAR PATH.</span>
                </div>
                <div className="cards">
                  {courses.map((c, i) => {
                    const complete = c.modules.filter(
                      (m) => m.mastery?.completed,
                    ).length;
                    return (
                      <button
                        className={`card course-card tone-${i}`}
                        key={c.id}
                        onClick={() => navigate("course", c.id)}
                      >
                        <div className="course-top">
                          <span className="course-symbol">
                            {i === 0 ? (
                              <Scale />
                            ) : i === 1 ? (
                              <BookOpen />
                            ) : (
                              <Layers />
                            )}
                          </span>
                          <Badge>{c.id}</Badge>
                        </div>
                        <h3>{c.title}</h3>
                        <p className="muted">
                          15 modules · {c.sources.length} imported sources
                        </p>
                        <div className="progress">
                          <i style={{ width: `${(complete / 15) * 100}%` }} />
                        </div>
                        <div className="course-footer">
                          <span>{complete} of 15 completed</span>
                          <ArrowUpRight size={18} />
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="dashboard-bottom">
                  <section className="card continue">
                    <p className="eyebrow">YOUR NEXT CHAPTER</p>
                    <h3>
                      {continueModule?.title ?? "Your curriculum is complete"}
                    </h3>
                    <p className="muted">
                      {continueModule
                        ? `${continueModule.courseId} · Module ${continueModule.number} · Pick a source, take a note, make it yours.`
                        : "Keep your knowledge fresh with review."}
                    </p>
                    {continueModule && (
                      <button
                        className="primary"
                        onClick={() =>
                          navigate(
                            "module",
                            continueModule.courseId,
                            continueModule.id,
                          )
                        }
                      >
                        Continue studying <ChevronRight size={15} />
                      </button>
                    )}
                  </section>
                  <section className="card">
                    <div className="section-heading compact">
                      <h3>Recent activity</h3>
                      <Clock size={17} />
                    </div>
                    {data.sessions.length ? (
                      data.sessions.slice(0, 4).map((s) => (
                        <p className="activity" key={s.id}>
                          {s.kind} · {s.moduleId}
                          <small>
                            {new Date(s.createdAt).toLocaleDateString()}
                          </small>
                        </p>
                      ))
                    ) : (
                      <div className="empty">
                        <BookOpen size={24} />
                        <p>A fresh start awaits.</p>
                        <small>
                          Your quiz and flashcard sessions will appear here.
                        </small>
                      </div>
                    )}
                  </section>
                </div>
                <div className="source-banner">
                  <FileText size={20} />
                  <p>
                    <strong>A curriculum map is your starting point.</strong>{" "}
                    Missing readings and answers stay marked unavailable. Import
                    your own materials to bring your library to life.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => navigate("import")}
                  >
                    Add sources <ArrowUpRight size={16} />
                  </button>
                </div>
              </>
            )}
            {view === "course" && course && (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">{course.id} · COURSE OVERVIEW</p>
                    <h2>{course.title}</h2>
                    <p className="muted">
                      15 modules. Follow your assigned curriculum at your own
                      pace.
                    </p>
                  </div>
                  <Badge>
                    {course.modules.filter((m) => m.mastery?.completed).length}{" "}
                    / 15 complete
                  </Badge>
                </div>
                <div className="module-list">
                  {course.modules.map((m) => (
                    <button
                      className="module-row"
                      key={m.id}
                      onClick={() => navigate("module", course.id, m.id)}
                    >
                      <span className="module-number">
                        {m.mastery?.completed ? (
                          <Check size={20} />
                        ) : (
                          String(m.number).padStart(2, "0")
                        )}
                      </span>
                      <div>
                        <h3>{m.title}</h3>
                        <p>
                          {m.notes.some(
                            (n: Row) => n.kind === "assigned reading",
                          )
                            ? "Assignments imported; reading coverage unverified"
                            : m.sources.length
                              ? "Sources imported; assigned reading coverage unverified"
                              : "Readings unavailable"}{" "}
                          · {m.notes.length} notes
                        </p>
                      </div>
                      <div className="module-metrics">
                        <span>Quiz {accuracy(m)}</span>
                        <span>
                          Self-rated mastery {m.mastery?.mastery ?? 0}%
                        </span>
                      </div>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                </div>
              </>
            )}
            {view === "module" && module && (
              <>
                <button
                  className="breadcrumb text-button"
                  onClick={() => navigate("course", module.courseId)}
                >
                  ← {module.courseId} · Course overview
                </button>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">
                      MODULE {String(module.number).padStart(2, "0")}
                    </p>
                    <h2>{module.title}</h2>
                    <p className="muted">{module.coverage}</p>
                  </div>
                  <button
                    className={
                      module.mastery?.completed ? "outline" : "primary"
                    }
                    onClick={() =>
                      perform(
                        "progress",
                        {
                          moduleId: module.id,
                          completed: !module.mastery?.completed,
                          mastery: module.mastery?.mastery ?? 0,
                        },
                        "Progress updated",
                      ).catch(() => {})
                    }
                  >
                    <Check size={15} />
                    {module.mastery?.completed
                      ? "Marked complete"
                      : "Mark complete"}
                  </button>
                </div>
                <nav className="tabs" aria-label="Module sections">
                  {tabs.map((t) => (
                    <button
                      aria-current={tab === t ? "page" : undefined}
                      className={tab === t ? "selected" : ""}
                      key={t}
                      onClick={() => setTab(t)}
                    >
                      {t}
                    </button>
                  ))}
                </nav>
                {tab === "Overview" ? (
                  <div className="two-columns">
                    <section className="card">
                      <h3>What’s on the map</h3>
                      {module.topics.length ? (
                        module.topics.map((t: Row) => (
                          <div className="topic" key={t.id}>
                            <strong>{t.name}</strong>
                            <p className="muted">
                              {t.rule ??
                                "Rule unavailable — add sourced material to fill this gap."}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="muted">
                          No topics supplied for this module. Add your notes or
                          import an assigned source.
                        </p>
                      )}
                      <h4>Self-rated mastery</h4>
                      <label className="field">
                        Mastery (0–100%)
                        <input
                          key={module.mastery?.mastery ?? 0}
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={module.mastery?.mastery ?? 0}
                          onBlur={(e) =>
                            perform(
                              "progress",
                              {
                                moduleId: module.id,
                                completed: module.mastery?.completed ?? false,
                                mastery: Number(e.target.value),
                              },
                              "Self-assessment saved",
                            ).catch(() => {})
                          }
                        />
                      </label>
                    </section>
                    <section className="card">
                      <h3>Your study toolkit</h3>
                      <p className="muted">
                        Use your verified materials to study. Missing answers
                        never enter a graded session.
                      </p>
                      <button
                        className="tool-row"
                        onClick={() => setTab("Notes")}
                      >
                        <FileText size={18} />
                        Write a note
                        <ChevronRight size={16} />
                      </button>
                      <button
                        className="tool-row"
                        onClick={() => setTab("Flashcards")}
                      >
                        <Layers size={18} />
                        Review flashcards
                        <ChevronRight size={16} />
                      </button>
                      <button
                        className="tool-row"
                        onClick={() => setTab("IRAC Essays")}
                      >
                        <BookOpen size={18} />
                        Work through an essay
                        <ChevronRight size={16} />
                      </button>
                      <button
                        className="tool-row"
                        onClick={() => setTab("Mini Module Exam")}
                      >
                        Take the end-of-module mini exam
                        <ChevronRight size={16} />
                      </button>
                      <Badge>{module.sources.length} imported sources</Badge>
                    </section>
                  </div>
                ) : tab === "Assigned Readings" ? (
                  <section className="card">
                    <h3>Assigned readings</h3>
                    {module.notes.filter(
                      (n: Row) => n.kind === "assigned reading",
                    ).length ? (
                      module.notes
                        .filter((n: Row) => n.kind === "assigned reading")
                        .map((n: Row) => (
                          <article key={n.id}>
                            <Badge>
                              {n.origin} · {n.status}
                            </Badge>
                            <p className="preserve">{n.body}</p>
                            <Citation
                              module={libraryModule(module)}
                              id={n.excerptId}
                            />
                            <button
                              className="text-button"
                              onClick={() => edit("note", module, n)}
                            >
                              Review assignment
                            </button>
                          </article>
                        ))
                    ) : (
                      <p>
                        The curriculum map provides no verified assigned
                        readings for this module. Add assignments from an actual
                        syllabus.
                      </p>
                    )}
                    <p className="muted">
                      Assignments are separate from reading completion. Uploaded
                      textbook editions and chapter coverage require review; no
                      source was automatically matched to a historic assigned
                      edition.
                    </p>
                    <button
                      className="primary"
                      onClick={() => {
                        setFilter(module.courseId);
                        setModuleFilter(module.id);
                        navigate("import");
                      }}
                    >
                      Import a reading
                    </button>
                  </section>
                ) : tab === "Mini Module Exam" ? (
                  <MiniModuleExam
                    key={module.id}
                    module={libraryModule(module)}
                    onSave={(v) => perform("essay", v, "Exam response saved")}
                  />
                ) : tab === "Sources" ? (
                  <SourceList sources={module.sources} />
                ) : (
                  <>
                    <div className="section-heading">
                      <h3>{tab}</h3>
                      <div className="actions">
                        {tab === "Flashcards" && (
                          <button
                            className="outline"
                            onClick={() => setStudy(module)}
                          >
                            Study verified cards
                          </button>
                        )}
                        {tab === "Practice Questions" && (
                          <button
                            className="outline"
                            onClick={() => setExam(module)}
                          >
                            Start practice exam
                          </button>
                        )}
                        {tab === "IRAC Essays" && (
                          <button
                            className="outline"
                            onClick={() =>
                              setEssay({
                                moduleId: module.id,
                                title: "Untitled IRAC essay",
                                issue: "",
                                rule: "",
                                application: "",
                                conclusion: "",
                                assessment: "",
                                checklist: "[]",
                                seconds: 0,
                              })
                            }
                          >
                            New IRAC draft
                          </button>
                        )}
                        <button
                          className="primary"
                          onClick={() => edit(kinds[tab], module)}
                        >
                          <Plus size={15} />
                          Add{" "}
                          {tab === "Practice Questions" ? "question" : "item"}
                        </button>
                      </div>
                    </div>
                    {tab === "IRAC Essays" &&
                      module.drafts.map((d: Row) => (
                        <button
                          className="tool-row"
                          key={d.id}
                          onClick={() => setEssay(d)}
                        >
                          <FileText size={18} />
                          {d.title}
                          <small>Resume draft</small>
                        </button>
                      ))}
                    <div className="item-list">
                      {module[collections[kinds[tab]]]
                        .filter((r: Row) =>
                          tab === "Seminar & Quiz Feedback"
                            ? ["seminar", "quiz feedback"].includes(r.kind)
                            : tab === "Notes"
                              ? ![
                                  "seminar",
                                  "quiz feedback",
                                  "assigned reading",
                                ].includes(r.kind)
                              : true,
                        )
                        .map((item: Row) => (
                          <article className="card item" key={item.id}>
                            <div className="item-meta">
                              <Badge>{item.status}</Badge>
                              <small>{item.origin}</small>
                            </div>
                            <h3>{item.title}</h3>
                            <p className="preserve">
                              {item.body ||
                                (kinds[tab] === "flashcard"
                                  ? item.answer
                                  : null) ||
                                (item.status === "missing"
                                  ? "Content unavailable — this is a curriculum placeholder."
                                  : "Open the editor to review this item’s fields.")}
                            </p>
                            {kinds[tab] === "caseBrief" &&
                              [
                                "citation",
                                "facts",
                                "posture",
                                "issue",
                                "holding",
                                "reasoning",
                                "rule",
                                "dissent",
                                "significance",
                              ].map((k) =>
                                item[k] ? (
                                  <p key={k}>
                                    <strong>{label(k)}: </strong>
                                    {item[k]}
                                  </p>
                                ) : null,
                              )}
                            {kinds[tab] === "rule" &&
                              extraFields.rule.map((k) =>
                                item[k] ? (
                                  <p key={k}>
                                    <strong>{label(k)}: </strong>
                                    {item[k]}
                                  </p>
                                ) : null,
                              )}
                            {item.excerptId && (
                              <Citation
                                module={libraryModule(module)}
                                id={item.excerptId}
                              />
                            )}
                            {kinds[tab] === "essayPrompt" && (
                              <button
                                className="outline"
                                onClick={() =>
                                  setEssay({
                                    moduleId: module.id,
                                    title: item.title,
                                    issue: "",
                                    rule: "",
                                    application: "",
                                    conclusion: "",
                                    assessment: "",
                                    checklist: "[]",
                                    seconds: 0,
                                    prompt: item,
                                  })
                                }
                              >
                                Write an IRAC response
                              </button>
                            )}
                            <button
                              className="text-button"
                              onClick={() => edit(kinds[tab], module, item)}
                            >
                              Edit item <ArrowUpRight size={15} />
                            </button>
                          </article>
                        ))}
                    </div>
                    {!module[collections[kinds[tab]]].length && (
                      <div className="empty card">
                        <BookOpen />
                        <h3>Your space to build understanding</h3>
                        <p>
                          Add your own material or create an item from a source
                          excerpt.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            {view === "search" && (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">CONNECT THE DOTS</p>
                    <h2>Search your library</h2>
                    <p className="muted">
                      Find courses, modules, topics, rules, cases, notes, and
                      flashcards.
                    </p>
                  </div>
                </div>
                <div className="search-bar">
                  <Search size={18} />
                  <input
                    aria-label="Search library"
                    placeholder="Try a case name, topic, or note…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <Filters
                  courses={courses}
                  course={filter}
                  module={moduleFilter}
                  onCourse={(v) => {
                    setFilter(v);
                    setModuleFilter("");
                  }}
                  onModule={setModuleFilter}
                />
                <div className="item-list">
                  {(() => {
                    const q = query.toLowerCase().trim();
                    if (!q)
                      return (
                        <div className="empty card">
                          Enter a search to explore your library.
                        </div>
                      );
                    const results = modules
                      .filter(
                        (m) =>
                          (!filter || m.courseId === filter) &&
                          (!moduleFilter || m.id === moduleFilter),
                      )
                      .flatMap((m) => [
                        {
                          title: `${m.courseId} ${courses.find((c) => c.id === m.courseId)?.title} ${m.title}`,
                          body: m.coverage,
                          type: "Module",
                          m,
                        },
                        ...m.topics.map((r: Row) => ({
                          title: r.name,
                          body: r.rule,
                          type: "Topic",
                          m,
                        })),
                        ...["rules", "cases", "notes", "flashcards"].flatMap(
                          (key) =>
                            m[key].map((r: Row) => ({
                              title: r.title,
                              body: [
                                r.body,
                                r.answer,
                                r.holding,
                                r.facts,
                                r.issue,
                                r.reasoning,
                                r.rule,
                                r.elements,
                                r.exceptions,
                              ]
                                .filter(Boolean)
                                .join("\n"),
                              type: key,
                              m,
                            })),
                        ),
                      ])
                      .filter((r) =>
                        `${r.title} ${r.body ?? ""}`.toLowerCase().includes(q),
                      );
                    return results.length ? (
                      results.map((r, i) => (
                        <button
                          className="card search-result"
                          key={i}
                          onClick={() =>
                            navigate("module", r.m.courseId, r.m.id)
                          }
                        >
                          <Badge>{r.type}</Badge>
                          <h3>{r.title}</h3>
                          <p className="muted">
                            {r.body?.slice(0, 200) || "Content unavailable"} ·{" "}
                            {r.m.id}
                          </p>
                        </button>
                      ))
                    ) : (
                      <div className="empty card">
                        <Search />
                        <h3>No matches yet</h3>
                        <p>
                          Try another term, clear a filter, or import more
                          material.
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
            {view === "import" && (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">BRING YOUR MATERIALS TOGETHER</p>
                    <h2>Source library</h2>
                    <p className="muted">
                      Shared study notes are included. Your uploads stay
                      private. You decide what enters your study collection.
                    </p>
                  </div>
                </div>
                <ImportForm
                  courses={courses}
                  initialModule={moduleFilter}
                  onImport={async (form) => {
                    const wantsAI = form.get("generateAI") === "on";
                    if (wantsAI && !form.get("moduleId"))
                      throw new Error(
                        "Choose a destination module before creating AI study notes.",
                      );
                    const imported = await perform(
                      "import",
                      form,
                      "Imported. Inspect the extraction below before creating study items.",
                    );
                    if (wantsAI) {
                      const latest = await api("state");
                      const source = latest.courses
                        .flatMap((c: Course) => c.sources)
                        .find((s: Row) => s.id === imported.id);
                      if (source?.excerpts.length) {
                        const excerpt = await api(
                          `excerpt?id=${encodeURIComponent(source.excerpts[0].id)}`,
                        );
                        if (excerpt?.text?.trim())
                          setAISelection({
                            source,
                            excerpt,
                            moduleId: form.get("moduleId"),
                          });
                        else
                          setNotice(
                            "Source imported. No usable text in the first section; inspect the source or provide OCR before AI generation.",
                          );
                      }
                    }
                  }}
                />
                <SourceList
                  sources={sources}
                  modules={modules}
                  onAI={(excerpt, source) =>
                    setAISelection({
                      excerpt,
                      source,
                      moduleId: source.moduleId,
                    })
                  }
                  onCreate={async (excerpt, source) => {
                    await refresh();
                    const m =
                      modules.find(
                        (m) => m.id === (source.moduleId || moduleFilter),
                      ) || modules.find((m) => m.courseId === source.courseId);
                    if (m)
                      setEditor({
                        kind: "note",
                        moduleId: m.id,
                        title: "",
                        body: "",
                        status: "needs_review",
                        excerptId: excerpt.id,
                      });
                  }}
                />
              </>
            )}
            {view === "review" && (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">A HUMAN IN THE LOOP</p>
                    <h2>Review queue</h2>
                    <p className="muted">
                      Check the source, edit the content, and explicitly verify
                      it before studying.
                    </p>
                  </div>
                </div>
                {reviewItems.length ? (
                  reviewItems.map((r) => (
                    <button
                      className="tool-row"
                      key={r.id}
                      onClick={() => edit(r.kind, r.module, r)}
                    >
                      <FileText size={18} />
                      <span>
                        {r.title}
                        <small>
                          {r.module.id} · {r.kind} · {r.origin}
                        </small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  ))
                ) : (
                  <div className="empty card">
                    <Check />
                    <h3>Nothing waiting for review</h3>
                    <p>
                      New source-derived items will appear here. Curriculum gaps
                      remain missing.
                    </p>
                  </div>
                )}
              </>
            )}
            {view === "analytics" && (
              <Analytics data={data} modules={modules} />
            )}
            {view === "settings" && (
              <SettingsPanel
                onPackageImported={refresh}
                preferences={data.preferences}
                onSave={(v) => perform("preferences", v, "Preferences saved")}
                onRestore={(v) => perform("restore", v, "Backup restored")}
                onDelete={(v) =>
                  perform("delete", v, "Local study data deleted")
                }
              />
            )}
            <footer>
              CASEBOOK <span>Make knowledge your own.</span>
              <span>Private workspace · Personal AI connection optional</span>
            </footer>
          </>
        )}
      </main>
      {editor && (
        <Editor
          item={editor}
          modules={modules.map(libraryModule)}
          onClose={() => setEditor(null)}
          onSave={async (value) => {
            await perform("item", value);
            setEditor(null);
          }}
        />
      )}
      {study && (
        <FlashStudy
          module={libraryModule(study)}
          onClose={() => {
            setStudy(null);
            refresh();
          }}
          onReview={(id, rating) =>
            perform("review", { id, rating }, "Review saved")
          }
        />
      )}{" "}
      {exam && (
        <Exam
          module={exam}
          onClose={() => {
            setExam(null);
            refresh();
          }}
          onSubmit={(id, selected) =>
            perform("quiz", { id, selected }, "Answer recorded")
          }
        />
      )}{" "}
      {aiSelection && (
        <Modal
          title="AI study notes and mini exam"
          onClose={() => setAISelection(null)}
        >
          <AIStudyPanel
            excerpt={aiSelection.excerpt}
            source={aiSelection.source}
            moduleId={aiSelection.moduleId}
            onLoadExcerpt={(id) => api(`excerpt?id=${encodeURIComponent(id)}`)}
            onSave={(v) =>
              perform("ai-study", v, "Personal AI study draft added")
            }
          />
        </Modal>
      )}
      {essay && (
        <Essay
          initial={essay}
          onClose={() => {
            setEssay(null);
            refresh();
          }}
          onSave={(v) => api("essay", v)}
        />
      )}
    </div>
  );
}
function Filters({
  courses,
  course,
  module,
  onCourse,
  onModule,
}: {
  courses: Course[];
  course: string;
  module: string;
  onCourse: (s: string) => void;
  onModule: (s: string) => void;
}) {
  return (
    <div className="filters">
      <label>
        Course
        <select value={course} onChange={(e) => onCourse(e.target.value)}>
          <option value="">All courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} · {c.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Module
        <select value={module} onChange={(e) => onModule(e.target.value)}>
          <option value="">All modules</option>
          {courses
            .filter((c) => !course || course === c.id)
            .flatMap((c) => c.modules)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.id} · {m.title}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
function Citation({ module, id }: { module: Module; id: string }) {
  for (const s of module.sources) {
    const e = s.excerpts.find((e: Row) => e.id === id);
    if (e)
      return (
        <p className="citation">
          Source: {s.title} · {e.page ? `page ${e.page}` : e.section} ·{" "}
          {e.page ? "location retained" : "location needs review"}
        </p>
      );
  }
  return <p className="citation">Source locator unavailable</p>;
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current
      ?.querySelector<HTMLElement>("button,input,textarea,select")
      ?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,textarea,select,a[href]",
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handler);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="modal-heading">
          <h3>{title}</h3>
          <button className="icon" aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Editor({
  item,
  modules,
  onClose,
  onSave,
}: {
  item: Row;
  modules: Module[];
  onClose: () => void;
  onSave: (v: Row) => Promise<void>;
}) {
  const [value, setValue] = useState<Row>(item),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [excerptText, setExcerptText] = useState("");
  useEffect(() => {
    let live = true;
    if (value.excerptId)
      api(`excerpt?id=${encodeURIComponent(value.excerptId)}`)
        .then((e) => {
          if (live) setExcerptText(e?.text ?? "");
        })
        .catch((e) => setError(String(e)));
    else setExcerptText("");
    return () => {
      live = false;
    };
  }, [value.excerptId]);
  const m = modules.find((m) => m.id === value.moduleId)!;
  const set = (key: string, v: unknown) =>
    setValue((old) => ({ ...old, [key]: v }));
  return (
    <Modal
      title={item.id ? "Edit study item" : "Create study item"}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const fields: Row = {};
            for (const k of extraFields[value.kind])
              fields[k] =
                k === "kind" ? (value.noteKind ?? "notes") : (value[k] ?? "");
            if (value.kind === "mCQ") {
              fields.options = JSON.stringify(
                value.options ? JSON.parse(value.options) : ["", "", "", ""],
              );
              fields.explanations = JSON.stringify(
                value.explanations
                  ? JSON.parse(value.explanations)
                  : ["", "", "", ""],
              );
              fields.correct =
                value.correct === undefined || value.correct === ""
                  ? null
                  : Number(value.correct);
            }
            await onSave({
              kind: value.kind,
              id: value.id,
              moduleId: value.moduleId,
              title: value.title,
              body: value.body || null,
              status: value.status,
              excerptId: value.excerptId || null,
              fields,
            });
          } catch (e) {
            setError(String(e));
            setBusy(false);
          }
        }}
      >
        {!item.id && (
          <label className="field">
            Destination module
            <select
              value={value.moduleId}
              onChange={(e) => set("moduleId", e.target.value)}
            >
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} · {m.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {!item.id && (
          <label className="field">
            Item type
            <select
              value={value.kind}
              onChange={(e) => set("kind", e.target.value)}
            >
              {Object.keys(extraFields).map((k) => (
                <option key={k} value={k}>
                  {label(k)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          Title / question
          <input
            required
            value={value.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </label>
        <label className="field">
          Content / summary
          <textarea
            rows={4}
            value={value.body ?? ""}
            onChange={(e) => set("body", e.target.value)}
          />
        </label>
        {extraFields[value.kind].map((key) => (
          <label className="field" key={key}>
            {label(key)}
            {key === "kind" ? (
              <select
                value={value.noteKind ?? "notes"}
                onChange={(e) => set("noteKind", e.target.value)}
              >
                <option>notes</option>
                <option>seminar</option>
                <option>quiz feedback</option>
                <option>assigned reading</option>
              </select>
            ) : (
              <textarea
                rows={key === "answer" ? 4 : 2}
                value={value[key] ?? ""}
                onChange={(e) => set(key, e.target.value)}
              />
            )}
          </label>
        ))}
        {value.kind === "mCQ" && (
          <fieldset>
            <legend>Answer key — editorial view only</legend>
            {[0, 1, 2, 3].map((i) => (
              <div key={i}>
                <label className="field">
                  Option {String.fromCharCode(65 + i)}
                  <input
                    required
                    value={
                      value.options ? (JSON.parse(value.options)[i] ?? "") : ""
                    }
                    onChange={(e) => {
                      const a = value.options
                        ? JSON.parse(value.options)
                        : ["", "", "", ""];
                      a[i] = e.target.value;
                      set("options", JSON.stringify(a));
                    }}
                  />
                </label>
                <label className="field">
                  Explanation for {String.fromCharCode(65 + i)}
                  <textarea
                    required
                    value={
                      value.explanations
                        ? (JSON.parse(value.explanations)[i] ?? "")
                        : ""
                    }
                    onChange={(e) => {
                      const a = value.explanations
                        ? JSON.parse(value.explanations)
                        : ["", "", "", ""];
                      a[i] = e.target.value;
                      set("explanations", JSON.stringify(a));
                    }}
                  />
                </label>
              </div>
            ))}
            <label className="field">
              Correct answer
              <select
                value={value.correct ?? ""}
                onChange={(e) => set("correct", e.target.value)}
              >
                <option value="">Unverified / missing</option>
                {[0, 1, 2, 3].map((i) => (
                  <option value={i} key={i}>
                    {String.fromCharCode(65 + i)}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        )}
        <label className="field">
          Source excerpt
          <select
            value={value.excerptId ?? ""}
            onChange={(e) => set("excerptId", e.target.value)}
          >
            <option value="">User-written · no source attached</option>
            {m.sources.flatMap((s: Row) =>
              s.excerpts.map((ex: Row) => (
                <option key={ex.id} value={ex.id}>
                  {s.title} · {ex.page ? `page ${ex.page}` : ex.section}
                </option>
              )),
            )}
          </select>
        </label>
        {value.excerptId && (
          <div className="source-preview">
            <Citation module={m} id={value.excerptId} />
            <p className="preserve">{excerptText.slice(0, 5000)}</p>
          </div>
        )}
        <label className="field">
          Review status
          <select
            value={value.status}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="needs_review">Needs review</option>
            <option value="verified">Verified by me</option>
            <option value="missing">Missing</option>
          </select>
        </label>
        <p className="muted">
          Verify accuracy and provenance yourself. Imported text is reference
          material. AI-generated items remain drafts until you verify them.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Confirm & save item"}
        </button>
      </form>
    </Modal>
  );
}
function SourceList({
  sources,
  modules = [],
  onCreate,
  onAI,
}: {
  sources: Row[];
  modules?: Module[];
  onCreate?: (e: Row, s: Row) => void;
  onAI?: (e: Row, s: Row) => void;
}) {
  return (
    <section className="source-list">
      <div className="section-heading">
        <h3>Imported sources</h3>
        <Badge>{sources.length} files</Badge>
      </div>
      {sources.length ? (
        sources.map((s) => (
          <SourceViewer
            source={s}
            modules={modules}
            key={s.id}
            onCreate={onCreate}
            onAI={onAI}
          />
        ))
      ) : (
        <div className="empty card">
          <Upload />
          <h3>No files imported yet</h3>
          <p>
            Textbooks, readings, and seminar content are unavailable until you
            supply them.
          </p>
        </div>
      )}
    </section>
  );
}
function SourceViewer({
  source: s,
  modules,
  onCreate,
  onAI,
}: {
  source: Row;
  modules: Module[];
  onCreate?: (e: Row, s: Row) => void;
  onAI?: (e: Row, s: Row) => void;
}) {
  const [open, setOpen] = useState(false),
    [index, setIndex] = useState(0),
    [excerpt, setExcerpt] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [section, setSection] = useState(""),
    [target, setTarget] = useState(s.moduleId ?? ""),
    [passage, setPassage] = useState("");
  useEffect(() => {
    if (!open) return;
    let live = true;
    api(
      `excerpt?id=${encodeURIComponent(s.excerpts[index]?.id ?? "undefined")}`,
    )
      .then((e) => {
        if (live) {
          setExcerpt(e);
          setSection(e?.section ?? "");
          setPassage("");
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      live = false;
    };
  }, [open, index, s.id]);
  return (
    <details className="card" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <strong>{s.title}</strong>
        <Badge>{s.status}</Badge>
        <small>
          {s.courseId} · {s.moduleId || "Course library"} · {s.type}
        </small>
      </summary>
      <p className="muted">
        {s.author || "Author unspecified"} ·{" "}
        {s.edition || "Edition unspecified"} · Rights: {s.rights}
      </p>
      <p className="citation">SHA-256: {s.hash}</p>
      {["ocr_needed", "ocr_draft"].includes(s.status) && (
        <p className="alert">
          OCR output is a draft. Check it against the original; pages without
          usable text remain unavailable.
        </p>
      )}
      <label className="field">
        Extracted page / section
        <select
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
        >
          {s.excerpts.map((e: Row, i: number) => (
            <option key={e.id} value={i}>
              {e.page ? `PDF page ${e.page}` : e.section}
            </option>
          ))}
        </select>
      </label>
      {excerpt ? (
        <div className="excerpt">
          <h4>{excerpt.page ? `PDF page ${excerpt.page}` : excerpt.section}</h4>
          <p className="preserve">
            {excerpt.text || "No extractable text on this page — OCR needed."}
          </p>
          {!excerpt.page && (
            <>
              <label className="field">
                Verified chapter / section locator
                <input
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                />
              </label>
              <button
                className="outline"
                onClick={async () => {
                  try {
                    const r = await api("locator", { id: excerpt.id, section });
                    setExcerpt(r);
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                {excerpt.locatorVerified
                  ? "Update verified locator"
                  : "I checked this locator against the original"}
              </button>
              <p className="muted">
                EPUB and DOCX pagination is not a printed page number. Verify
                and record the chapter or section yourself.
              </p>
            </>
          )}
          {onCreate && excerpt.text && (
            <>
              <label className="field">
                Study-item destination
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">Choose module</option>
                  {modules
                    .filter(
                      (m) =>
                        m.courseId === s.courseId &&
                        (!s.moduleId || m.id === s.moduleId),
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id} · {m.title}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                Exact passage to use (optional; copy up to 12,000 characters
                from the extraction)
                <textarea
                  rows={3}
                  value={passage}
                  onChange={(e) => setPassage(e.target.value)}
                  maxLength={12000}
                />
              </label>
              <button
                className="outline"
                disabled={!target}
                onClick={async () => {
                  try {
                    const selected = passage
                      ? await api("select-excerpt", {
                          id: excerpt.id,
                          text: passage,
                        })
                      : excerpt;
                    onCreate(selected, { ...s, moduleId: target });
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                Choose this excerpt & create item
              </button>
              {onAI && (
                <button
                  className="outline"
                  disabled={!target}
                  onClick={async () => {
                    try {
                      const selected = passage
                        ? await api("select-excerpt", {
                            id: excerpt.id,
                            text: passage,
                          })
                        : excerpt;
                      onAI(selected, { ...s, moduleId: target });
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  AI summary, notes & exam questions
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <p>Loading extraction…</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
function ImportForm({
  courses,
  initialModule,
  onImport,
}: {
  courses: Course[];
  initialModule: string;
  onImport: (f: FormData) => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="card import-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const f = e.currentTarget;
        try {
          await onImport(new FormData(f));
          f.reset();
        } catch (e) {
          setError(String(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="upload-heading">
        <span className="stat-icon">
          <Upload size={24} />
        </span>
        <div>
          <h3>Add a source</h3>
          <p className="muted">
            PDF, EPUB, DOCX, TXT, Markdown, or JSON · Up to 20 MiB per file
          </p>
        </div>
      </div>
      <label className="field">
        File
        <input
          name="file"
          type="file"
          accept=".pdf,.epub,.docx,.txt,.md,.json"
          required
        />
      </label>
      <div className="form-grid">
        <label className="field">
          Title
          <input name="title" required />
        </label>
        <label className="field">
          Course
          <select name="courseId" required>
            <option value="">Choose a course</option>
            {courses.map((c) => (
              <option value={c.id} key={c.id}>
                {c.id} · {c.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Course / module
          <select name="moduleId" defaultValue={initialModule || ""}>
            <option value="">Whole course · no module assignment</option>
            {courses
              .flatMap((c) => c.modules)
              .map((m) => (
                <option value={m.id} key={m.id}>
                  {m.id} · {m.title}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          Author
          <input name="author" />
        </label>
        <label className="field">
          Edition
          <input name="edition" />
        </label>
        <label className="field">
          Source type
          <select name="type">
            {[
              "notes",
              "textbook excerpt",
              "syllabus",
              "case",
              "seminar",
              "quiz feedback",
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Rights / permission to use
          <input
            name="rights"
            placeholder="e.g. My own notes; personal study copy"
            required
          />
        </label>
      </div>
      <p className="muted">
        Originals stay in the private local store. Importing extracts text; it
        does not create answers or mark reading assignments complete. Inspect
        the extraction, choose an excerpt, then confirm each study item.
        Duplicate files are preserved without replacement.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <label className="check-row">
        <input type="checkbox" name="generateAI" />
        After import, open AI summary, notes & mini-exam setup (requires my own
        API key).
      </label>
      <button className="primary" disabled={busy}>
        <Upload size={15} />
        {busy ? "Extracting…" : "Upload & inspect extraction"}
      </button>
    </form>
  );
}
function FlashStudy({
  module,
  onClose,
  onReview,
}: {
  module: Module;
  onClose: () => void;
  onReview: (id: string, rating: number) => Promise<unknown>;
}) {
  const cards = module.flashcards.filter(
      (c: Row) =>
        c.answer && c.status === "verified" && new Date(c.due) <= new Date(),
    ),
    [index, setIndex] = useState(0),
    [reveal, setReveal] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const c = cards[index];
  const rate = useCallback(
    async (rating: number) => {
      if (!c || !reveal || busy) return;
      setBusy(true);
      try {
        await onReview(c.id, rating);
        setIndex((i) => i + 1);
        setReveal(false);
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [c, reveal, busy, onReview],
  );
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        )
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        setReveal(true);
      }
      if (["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key) - 1);
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [rate]);
  return (
    <Modal title="Flashcard review" onClose={onClose}>
      {c ? (
        <>
          <p className="eyebrow">
            {index + 1} / {cards.length} DUE CARDS
          </p>
          <div className="study-card">
            <h3>{c.title}</h3>
            {reveal ? (
              <p className="preserve">{c.answer}</p>
            ) : (
              <button className="primary" onClick={() => setReveal(true)}>
                Reveal answer · Space
              </button>
            )}
          </div>
          {reveal && (
            <div className="rating-buttons">
              {["Again", "Hard", "Good", "Easy"].map((label, i) => (
                <button disabled={busy} key={label} onClick={() => rate(i)}>
                  {label}
                  <small>{i + 1}</small>
                </button>
              ))}
            </div>
          )}
          <Citation module={module} id={c.excerptId ?? ""} />
        </>
      ) : (
        <div className="empty">
          <Check />
          <h3>{cards.length ? "Review complete" : "No verified cards due"}</h3>
          <p>Cards with missing answers stay outside study mode.</p>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </Modal>
  );
}
function Exam({
  module,
  onClose,
  onSubmit,
}: {
  module: Module;
  onClose: () => void;
  onSubmit: (id: string, selected: number) => Promise<Row>;
}) {
  const [topic, setTopic] = useState(""),
    [started, setStarted] = useState(false),
    [minutes, setMinutes] = useState(0),
    [remaining, setRemaining] = useState(0),
    [index, setIndex] = useState(0),
    [selected, setSelected] = useState<number | null>(null),
    [result, setResult] = useState<Row | null>(null),
    [results, setResults] = useState<boolean[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const questions = module.mcqs.filter(
      (q: Row) => q.gradable && (!topic || q.topic === topic),
    ),
    q = questions[index],
    expired = started && minutes > 0 && remaining === 0;
  useEffect(() => {
    if (!started || minutes === 0) return;
    const id = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [started, minutes]);
  return (
    <Modal title="Practice exam" onClose={onClose}>
      {!started ? (
        <>
          <p className="muted">
            Only verified questions with complete answer keys are included.
            Scope: {module.id}.
          </p>
          <label className="field">
            Topic
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">All topics</option>
              {[
                ...new Set<string>(
                  module.mcqs.map((q: Row) => String(q.topic)),
                ),
              ]
                .filter(Boolean)
                .map((t) => (
                  <option key={t}>{t}</option>
                ))}
            </select>
          </label>
          <label className="field">
            Time limit (minutes; 0 = untimed)
            <input
              type="number"
              min={0}
              max={240}
              value={minutes}
              onChange={(e) =>
                setMinutes(Math.min(240, Math.max(0, Number(e.target.value))))
              }
            />
          </label>
          <p>{questions.length} available questions</p>
          <button
            className="primary"
            disabled={!questions.length}
            onClick={() => {
              setRemaining(minutes * 60);
              setStarted(true);
            }}
          >
            Begin exam
          </button>
        </>
      ) : !q || expired ? (
        <div className="empty">
          <Check />
          <h3>{expired ? "Time is up" : "Session complete"}</h3>
          <p>
            {results.filter(Boolean).length} / {results.length} submitted
            answers correct
          </p>
          <p>
            Results are saved to your history. These are practice results, not a
            professor’s grade.
          </p>
        </div>
      ) : (
        <>
          <p className="eyebrow">
            QUESTION {index + 1} / {questions.length}{" "}
            {minutes
              ? `· ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
              : "· UNTIMED"}
          </p>
          <h3>{q.title}</h3>
          <p>{q.body}</p>
          <fieldset disabled={!!result || busy}>
            <legend>Choose one answer</legend>
            {JSON.parse(q.options).map((option: string, i: number) => (
              <label className="answer-choice" key={i}>
                <input
                  type="radio"
                  name="answer"
                  checked={selected === i}
                  onChange={() => setSelected(i)}
                />
                <strong>{String.fromCharCode(65 + i)}</strong>
                {option}
              </label>
            ))}
          </fieldset>
          {!result ? (
            <button
              className="primary"
              disabled={selected === null || busy}
              onClick={async () => {
                if (selected === null) return;
                setBusy(true);
                try {
                  const r = await onSubmit(q.id, selected);
                  setResult(r);
                  setResults((old) => [...old, r.correct]);
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Submit answer
            </button>
          ) : (
            <section className="feedback">
              <h4>{result.correct ? "Correct" : "Review this answer"}</h4>
              {result.explanations.map((ex: string, i: number) => (
                <p key={i}>
                  <strong>
                    {String.fromCharCode(65 + i)}
                    {result.correctOption === i ? " · Correct answer" : ""}
                    :{" "}
                  </strong>
                  {ex}
                </p>
              ))}
              <button
                className="primary"
                onClick={() => {
                  setIndex((i) => i + 1);
                  setSelected(null);
                  setResult(null);
                }}
              >
                Next question
              </button>
            </section>
          )}
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </Modal>
  );
}
function Essay({
  initial,
  onClose,
  onSave,
}: {
  initial: Row;
  onClose: () => void;
  onSave: (v: Row) => Promise<Row>;
}) {
  const [draft, setDraft] = useState(initial),
    [status, setStatus] = useState("All changes saved"),
    [running, setRunning] = useState(false);
  const latest = useRef(draft),
    saved = useRef(JSON.stringify(initial)),
    saving = useRef(false);
  latest.current = draft;
  const save = useCallback(async () => {
    if (saving.current) return;
    const current = latest.current;
    if (JSON.stringify(current) === saved.current) return;
    saving.current = true;
    setStatus("Saving…");
    try {
      const {
        id,
        moduleId,
        title,
        issue,
        rule,
        application,
        conclusion,
        assessment,
        checklist,
        seconds,
      } = current;
      const row = await onSave({
        id,
        moduleId,
        title,
        issue,
        rule,
        application,
        conclusion,
        assessment,
        checklist,
        seconds,
      });
      const next = { ...current, id: row.id };
      saved.current = JSON.stringify(next);
      latest.current = { ...latest.current, id: row.id };
      setDraft((d: Row) => ({ ...d, id: row.id }));
      setStatus("All changes saved");
    } catch (e) {
      setStatus(`Save failed: ${String(e)}`);
    } finally {
      saving.current = false;
    }
  }, [onSave]);
  useEffect(() => {
    const id = setInterval(save, 1500);
    return () => clearInterval(id);
  }, [save]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(
      () => setDraft((d: Row) => ({ ...d, seconds: d.seconds + 1 })),
      1000,
    );
    return () => clearInterval(id);
  }, [running]);
  const close = async () => {
    await save();
    if (saved.current === JSON.stringify(latest.current)) onClose();
    else setStatus("Please save successfully before closing.");
  };
  const update = (k: string, v: unknown) => {
    setDraft((d: Row) => ({ ...d, [k]: v }));
    setStatus("Unsaved changes");
  };
  return (
    <Modal title="IRAC essay workspace" onClose={close}>
      <label className="field">
        Essay title
        <input
          value={draft.title}
          onChange={(e) => update("title", e.target.value)}
        />
      </label>
      <div className="essay-toolbar">
        <button className="outline" onClick={() => setRunning(!running)}>
          <Clock size={16} />
          {running ? "Pause" : "Start"} timer
        </button>
        <span>
          {Math.floor(draft.seconds / 60)}:
          {String(draft.seconds % 60).padStart(2, "0")}
        </span>
        <small role="status">{status}</small>
      </div>
      {modulePrompt(initial)}
      {["issue", "rule", "application", "conclusion"].map((k) => (
        <label className="field" key={k}>
          {label(k)}
          <textarea
            aria-label={label(k)}
            rows={k === "application" ? 7 : 3}
            value={draft[k]}
            onChange={(e) => update(k, e.target.value)}
          />
        </label>
      ))}
      <fieldset>
        <legend>Self-review checklist</legend>
        {[
          "Identified material issues",
          "Stated rules with source citations",
          "Applied facts and counterarguments",
          "Reached a supported conclusion",
        ].map((text, i) => {
          const checked = JSON.parse(draft.checklist);
          return (
            <label className="check-row" key={text}>
              <input
                type="checkbox"
                checked={checked.includes(i)}
                onChange={(e) =>
                  update(
                    "checklist",
                    JSON.stringify(
                      e.target.checked
                        ? [...checked, i]
                        : checked.filter((n: number) => n !== i),
                    ),
                  )
                }
              />
              {text}
            </label>
          );
        })}
      </fieldset>
      <label className="field">
        Your self-assessment
        <textarea
          value={draft.assessment}
          onChange={(e) => update("assessment", e.target.value)}
        />
      </label>
      <p className="muted">
        Your self-assessment is not a professor’s grade. No automated grading or
        invented model answer.
      </p>
      <div className="actions">
        <button className="primary" onClick={save}>
          Save draft
        </button>
        <button
          className="outline"
          onClick={() => download("irac-essay.md", essayMarkdown(draft as any))}
        >
          Export Markdown
        </button>
      </div>
    </Modal>
  );
}
function modulePrompt(initial: Row) {
  return initial.prompt ? (
    <div className="card">
      <h4>{initial.prompt.title}</h4>
      <p>{initial.prompt.facts}</p>
      <p className="preserve">
        Rubric: {initial.prompt.rubric || "No sourced rubric supplied."}
      </p>
      {initial.prompt.status === "verified" && initial.prompt.modelAnswer && (
        <details>
          <summary>Verified model answer</summary>
          <p>{initial.prompt.modelAnswer}</p>
        </details>
      )}
    </div>
  ) : null;
}
function SettingsPanel({
  onPackageImported,
  preferences,
  onSave,
  onRestore,
  onDelete,
}: {
  onPackageImported: () => Promise<void>;
  preferences: Row | null;
  onSave: (v: Row) => Promise<unknown>;
  onRestore: (v: Row) => Promise<unknown>;
  onDelete: (v: Row) => Promise<unknown>;
}) {
  const [error, setError] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [restoreConfirm, setRestoreConfirm] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MAKE IT YOURS</p>
          <h2>Settings & data</h2>
          <p className="muted">
            Your study preferences and your data, under your control.
          </p>
        </div>
      </div>
      {typeof window !== "undefined" && window.casebookImportPackage && (
        <PhonePackagePanel onImported={onPackageImported} />
      )}
      <section className="card">
        <h3>Study preferences</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await onSave({
                theme: f.get("theme"),
                dailyGoal: Number(f.get("dailyGoal")),
              });
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          <div className="form-grid">
            <label className="field">
              Theme
              <select name="theme" defaultValue={preferences?.theme ?? "light"}>
                <option>light</option>
                <option>dark</option>
              </select>
            </label>
            <label className="field">
              Daily review goal
              <input
                name="dailyGoal"
                type="number"
                min={1}
                max={500}
                defaultValue={preferences?.dailyGoal ?? 20}
              />
            </label>
          </div>
          <button className="primary">Save preferences</button>
        </form>
      </section>
      <section className="card settings-card">
        <h3>Backup & restore</h3>
        <p className="muted">
          JSON backup includes study data, source metadata, and extracted text.
          Original binary documents are excluded.{" "}
          {typeof window !== "undefined" && window.casebookTransport
            ? "Use Export study package above to include your original books in an iPhone backup."
            : "Retain a private copy of the private/originals folder separately."}{" "}
          Backups contain private study content.
        </p>
        <button
          className="outline"
          onClick={async () => {
            try {
              download(
                "casebook-backup.json",
                JSON.stringify(await api("export"), null, 2),
                "application/json",
              );
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          Export local data
        </button>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const f = new FormData(e.currentTarget),
                file = f.get("backup") as File;
              if (file.size > 25 * 1024 * 1024)
                throw new Error("Backup exceeds 25 MiB");
              await onRestore({
                confirm: restoreConfirm,
                backup: JSON.parse(await file.text()),
              });
              setRestoreConfirm("");
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Choose JSON backup
            <input type="file" name="backup" accept=".json" required />
          </label>
          <label className="field">
            Restore replaces local study data. Type RESTORE to confirm.
            <input
              value={restoreConfirm}
              onChange={(e) => setRestoreConfirm(e.target.value)}
            />
          </label>
          <button
            className="outline"
            disabled={busy || restoreConfirm !== "RESTORE"}
          >
            Restore backup
          </button>
        </form>
      </section>
      <section className="card settings-card">
        <h3>Delete local study data</h3>
        <p className="muted">
          Deletes all course and study records, extracted text, and imported
          originals. Export a backup first. Rerun the seed command to recover
          only the starter curriculum.
        </p>
        <label className="field">
          Type DELETE to confirm
          <input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </label>
        <button
          className="danger"
          disabled={confirmation !== "DELETE"}
          onClick={async () => {
            try {
              await onDelete({ confirm: confirmation });
              setConfirmation("");
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          Delete local data
        </button>
      </section>
      <section className="card settings-card">
        <h3>Privacy & AI</h3>
        <p>
          No analytics. Uploaded documents are treated as untrusted source text.
          AI generation is optional: only the displayed passage is sent to
          OpenAI after you connect your own key and explicitly consent. API keys
          stay in tab memory and are excluded from backups.{" "}
          {typeof window !== "undefined" && window.casebookTransport
            ? "Your library stays in this device’s browser storage. The app host serves application code and does not receive your books or study records."
            : "Run on loopback for personal use; public hosting of the desktop server requires authentication and upload isolation before deployment."}
        </p>
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>
  );
}

function Analytics({ data, modules }: { data: State; modules: Module[] }) {
  const questions = modules.flatMap((m) =>
    m.mcqs.map((q: Row) => ({ ...q, module: m })),
  );
  const attempts: Row[] = data.attempts.map((a) => ({
    ...a,
    question: questions.find((q) => q.id === a.mcqId),
  }));
  const groups = new Map<string, { correct: number; total: number }>();
  for (const a of attempts) {
    const key = `${a.question?.module.courseId ?? "Unknown"} · ${a.question?.topic || a.question?.module.title || "Untitled"}`;
    const v = groups.get(key) ?? { correct: 0, total: 0 };
    v.total++;
    if (a.correct) v.correct++;
    groups.set(key, v);
  }
  const weak = [...groups.entries()].sort(
    (a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SEE WHAT’S TAKING SHAPE</p>
          <h2>Study insights</h2>
          <p className="muted">
            Practice results, self-assessment, and review activity. No invented
            mastery score.
          </p>
        </div>
      </div>
      <div className="two-columns">
        <section className="card">
          <h3>Areas to revisit</h3>
          {weak.length ? (
            weak.map(([name, v]) => (
              <div className="topic" key={name}>
                <strong>{name}</strong>
                <p>
                  {Math.round((v.correct / v.total) * 100)}% correct · {v.total}{" "}
                  attempts
                </p>
              </div>
            ))
          ) : (
            <p className="muted">
              Complete a verified practice question to see topic accuracy here.
            </p>
          )}
        </section>
        <section className="card">
          <h3>Review rhythm</h3>
          <p>{data.reviews.length} flashcard reviews recorded</p>
          <p>Daily goal: {data.preferences?.dailyGoal ?? 20} reviews</p>
          <p>
            Today:{" "}
            {
              data.reviews.filter(
                (r) =>
                  new Date(r.createdAt).toDateString() ===
                  new Date().toDateString(),
              ).length
            }{" "}
            reviews
          </p>
          <p>
            {modules.filter((m) => m.mastery?.completed).length} modules marked
            complete by you
          </p>
          <p className="muted">
            Completion and mastery are your self-assessment. Accuracy reflects
            saved quiz attempts.
          </p>
        </section>
      </div>
      <section className="card settings-card">
        <h3>Practice history</h3>
        {attempts.length ? (
          [...attempts].reverse().map((a) => (
            <p className="activity" key={a.id}>
              <span>
                {a.question?.title ?? "Question"} ·{" "}
                {a.correct ? "Correct" : "Revisit"}
              </span>
              <small>{new Date(a.createdAt).toLocaleString()}</small>
            </p>
          ))
        ) : (
          <p className="muted">No quiz attempts yet.</p>
        )}
      </section>
    </>
  );
}

function PhonePackagePanel({
  onImported,
}: {
  onImported: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [mergeMode, setMergeMode] = useState(true);
  return (
    <section className="card settings-card">
      <h3>Your iPhone study package</h3>
      <p>
        Your books and study data stay on this device. Add new materials while
        keeping your work, or explicitly choose a full backup restore. Nothing
        is uploaded to the app host.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            if (!mergeMode && confirmation !== "IMPORT")
              throw new Error("Type IMPORT to confirm replacement");
            const form = new FormData(e.currentTarget),
              file = form.get("studyPackage");
            if (!(file instanceof File))
              throw new Error("Choose the private study ZIP");
            if (mergeMode) {
              const r = await window.casebookMergePackage!(file);
              setMessage(
                `Added ${r.added} study records and filled ${r.filled} missing items. Your existing work and progress were kept.`,
              );
            } else {
              const r = await window.casebookImportPackage!(file);
              setMessage(
                `Imported ${r.courses} courses, ${r.modules} modules and ${r.sources} private sources.`,
              );
            }
            await onImported();
            setConfirmation("");
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Private study package
          <input
            name="studyPackage"
            type="file"
            accept=".zip,application/zip"
            required
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={mergeMode}
            onChange={(e) => setMergeMode(e.target.checked)}
          />
          Add study materials and keep my progress
        </label>
        {!mergeMode && (
          <label className="field">
            Type IMPORT to replace the local collection
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
        )}
        <button
          className="primary"
          disabled={busy || (!mergeMode && confirmation !== "IMPORT")}
        >
          {busy
            ? "Importing private materials…"
            : mergeMode
              ? "Add study materials"
              : "Import study package"}
        </button>
      </form>
      <button
        className="outline settings-card"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const blob = await window.casebookExportPackage!(),
              url = URL.createObjectURL(blob),
              a = document.createElement("a");
            a.href = url;
            a.download = "Casebook-iPhone-Study-Data.zip";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Export study package with original books
      </button>
      <p className="muted">
        Keep backups in Files. Browser storage can be cleared or evicted. An
        installed app and a persistence request reduce that risk but do not
        replace backups. Separate devices do not automatically sync.
      </p>
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function MiniModuleExam({
  module,
  onSave,
}: {
  module: Module;
  onSave: (v: Row) => Promise<Row>;
}) {
  const title = `Mini module exam: ${module.id}`;
  const saved = module.drafts?.find((d: Row) => d.title === title);
  const available = (module.flashcards ?? []).filter(
    (q: Row) => q.answer && q.excerptId && q.status !== "missing",
  );
  const personal = available.filter(
    (q: Row) => q.origin !== "Shared study draft",
  );
  const [questionIds, setQuestionIds] = useState<string[]>(() => {
    try {
      const ids = JSON.parse(saved?.rule || "null");
      if (
        Array.isArray(ids) &&
        ids.every((id) => typeof id === "string") &&
        ids.length
      )
        return ids.filter((id) => available.some((q: Row) => q.id === id));
    } catch {}
    return (personal.length ? personal : available)
      .slice(0, 5)
      .map((q: Row) => q.id);
  });
  const questions = questionIds
    .map((id) => available.find((q: Row) => q.id === id))
    .filter(Boolean);
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(saved?.application || "{}");
    } catch {
      return {};
    }
  });
  const [record, setRecord] = useState<Row | undefined>(saved);
  const [submitted, setSubmitted] = useState(saved?.assessment === "submitted");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (submit: boolean) => {
    setBusy(true);
    setMessage("Saving…");
    try {
      const row = await onSave({
        id: record?.id,
        moduleId: module.id,
        title,
        issue: "",
        rule: JSON.stringify(questionIds),
        application: JSON.stringify(answers),
        conclusion: "",
        assessment: submit ? "submitted" : "draft",
        checklist: "[]",
        seconds: 0,
      });
      setRecord(row);
      setSubmitted(submit);
      setMessage(
        submit
          ? "Exam response saved. Compare your answers with the source-linked explanations below."
          : "Exam draft saved on this device.",
      );
    } catch (e) {
      setMessage(`Save failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card">
      <h3>End-of-module mini exam</h3>
      <p>
        Short-answer practice from your imported study materials. Answer without
        looking, then submit to compare your work. This is self-reviewed
        practice; draft explanations do not produce an automatic grade.
      </p>
      {available.length > 0 && (
        <details>
          <summary>
            Choose exam questions ({questionIds.length}/5 selected)
          </summary>
          <p>
            Your personal questions are selected first. Change the selection to
            mix your uploads with shared study questions. Save the draft to keep
            your selection.
          </p>
          {available.map((q: Row) => (
            <label className="check-row" key={q.id}>
              <input
                type="checkbox"
                aria-label={`Use question: ${q.title}`}
                checked={questionIds.includes(q.id)}
                disabled={
                  busy ||
                  (!questionIds.includes(q.id) && questionIds.length >= 5)
                }
                onChange={(e) => {
                  setQuestionIds(
                    e.target.checked
                      ? [...questionIds, q.id]
                      : questionIds.filter((id) => id !== q.id),
                  );
                  setSubmitted(false);
                  setMessage(
                    "Question selection changed — save your exam draft.",
                  );
                }}
              />
              {q.title} · {q.origin}
            </label>
          ))}
        </details>
      )}
      {!questions.length ? (
        <p className="muted">
          No questions selected or available. Choose questions above, or import
          supported study materials and generate your own.
        </p>
      ) : (
        <>
          {questions.map((q: Row, i: number) => (
            <article key={q.id}>
              <label className="field">
                <strong>
                  {i + 1}. {q.title}
                </strong>
                <textarea
                  aria-label={`Exam answer ${i + 1}`}
                  rows={4}
                  value={answers[q.id] ?? ""}
                  onChange={(e) => {
                    setAnswers({ ...answers, [q.id]: e.target.value });
                    setSubmitted(false);
                    setMessage(
                      "Unsaved changes — save your draft before leaving.",
                    );
                  }}
                />
              </label>
              {submitted && (
                <div className="card">
                  <Badge>
                    {q.origin} · {q.status}
                  </Badge>
                  <p className="preserve">{q.answer}</p>
                  <p className="muted">{q.body}</p>
                  <Citation module={module} id={q.excerptId} />
                </div>
              )}
            </article>
          ))}
          <div className="actions">
            <button
              className="outline"
              disabled={busy}
              onClick={() => save(false)}
            >
              Save exam draft
            </button>
            <button
              disabled={
                busy || questions.some((q: Row) => !answers[q.id]?.trim())
              }
              onClick={() => save(true)}
            >
              Submit mini exam
            </button>
          </div>
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}

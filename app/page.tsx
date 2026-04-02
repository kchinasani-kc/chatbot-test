"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ScriptHistoryItem = {
  id: string;
  code: string;
  createdAt: string; // ISO string
};

type GroupedHistory = {
  dateKey: string;
  items: ScriptHistoryItem[];
};

type LeadButton = {
  id: string;
  name: string;
  formKey: string;
};

const STORAGE_KEY = "scriptHistory";
const LEAD_EMBED_KEY = "leadEmbedScript";
const LEAD_BUTTONS_KEY = "leadButtons";

function loadHistoryFromStorage(): ScriptHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScriptHistoryItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          typeof item?.id === "string" &&
          typeof item?.code === "string" &&
          typeof item?.createdAt === "string",
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}

function saveHistoryToStorage(items: ScriptHistoryItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors
  }
}

function groupHistoryByDate(history: ScriptHistoryItem[]): GroupedHistory[] {
  const byDate = new Map<string, ScriptHistoryItem[]>();
  for (const item of history) {
    const dateKey = item.createdAt.slice(0, 10);
    const list = byDate.get(dateKey) ?? [];
    list.push(item);
    byDate.set(dateKey, list);
  }

  const groups: GroupedHistory[] = [];
  for (const [dateKey, items] of byDate.entries()) {
    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    groups.push({ dateKey, items });
  }

  groups.sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
  return groups;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString();
}

function formatDateLabel(dateKey: string) {
  const d = new Date(dateKey);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function executeScript(code: string): string | null {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(code);
    fn();
    return null;
  } catch (err) {
    if (err instanceof Error) {
      return err.message;
    }
    return "Unknown error while executing script";
  }
}

export default function Home() {
  const [inputCode, setInputCode] = useState("");
  const [history, setHistory] = useState<ScriptHistoryItem[]>([]);
  const [currentScript, setCurrentScript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>(
    {},
  );
  const [activeTab, setActiveTab] = useState<"agent" | "website-lead-sources">(
    "agent",
  );
  const [embedScript, setEmbedScript] = useState("");
  const [isEmbedLoaded, setIsEmbedLoaded] = useState(false);
  const [leadButtons, setLeadButtons] = useState<LeadButton[]>([]);
  const lastScriptElementRef = useRef<HTMLScriptElement | null>(null);
  const embedScriptElementRef = useRef<HTMLScriptElement | null>(null);

  const runScriptTag = (input: string): string | null => {
    if (typeof document === "undefined") {
      return "Script tags can only be run in the browser.";
    }

    const container = document.createElement("div");
    container.innerHTML = input.trim();
    const scriptEl = container.querySelector("script");

    if (!scriptEl) {
      return "Could not find a <script> element in the input.";
    }

    const s = document.createElement("script");

    // Copy all attributes (src, async, data-*, etc.)
    for (const attr of Array.from(scriptEl.attributes)) {
      s.setAttribute(attr.name, attr.value);
    }

    if (!s.src) {
      s.text = scriptEl.textContent ?? "";
    }

    try {
      if (lastScriptElementRef.current?.isConnected) {
        lastScriptElementRef.current.remove();
      }
      (document.head ?? document.body).appendChild(s);
      lastScriptElementRef.current = s;
      return null;
    } catch (err) {
      if (err instanceof Error) {
        return err.message;
      }
      return "Failed to inject script into the page.";
    }
  };

  const runUserInput = (input: string): string | null => {
    const trimmed = input.trim();
    if (!trimmed) {
      return "Script cannot be empty.";
    }

    if (/^<script[\s>]/i.test(trimmed)) {
      return runScriptTag(trimmed);
    }

    return executeScript(trimmed);
  };

  const injectEmbedScript = (input: string): string | null => {
    if (typeof document === "undefined") {
      return "Script tags can only be run in the browser.";
    }
    const container = document.createElement("div");
    container.innerHTML = input.trim();
    const scriptEl = container.querySelector("script");
    if (!scriptEl) {
      return "Could not find a <script> element in the input.";
    }
    const s = document.createElement("script");
    for (const attr of Array.from(scriptEl.attributes)) {
      s.setAttribute(attr.name, attr.value);
    }
    if (!s.src) {
      s.text = scriptEl.textContent ?? "";
    }
    try {
      if (embedScriptElementRef.current?.isConnected) {
        embedScriptElementRef.current.remove();
      }
      (document.head ?? document.body).appendChild(s);
      embedScriptElementRef.current = s;
      return null;
    } catch (err) {
      if (err instanceof Error) return err.message;
      return "Failed to inject embed script.";
    }
  };

  useEffect(() => {
    const stored = loadHistoryFromStorage();
    if (stored.length === 0) return;

    setHistory(stored);
    const latest = stored[0];
    setCurrentScript(latest.code);
    setInputCode(latest.code);

    const latestDateKey = latest.createdAt.slice(0, 10);
    setExpandedDates((prev) => ({
      ...prev,
      [latestDateKey]: true,
    }));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedEmbed = window.localStorage.getItem(LEAD_EMBED_KEY);
      if (savedEmbed) {
        setEmbedScript(savedEmbed);
        const err = injectEmbedScript(savedEmbed);
        if (!err) setIsEmbedLoaded(true);
      }
      const savedButtons = window.localStorage.getItem(LEAD_BUTTONS_KEY);
      if (savedButtons) {
        const parsed = JSON.parse(savedButtons) as LeadButton[];
        if (Array.isArray(parsed)) setLeadButtons(parsed);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupedHistory = useMemo(
    () => groupHistoryByDate(history),
    [history],
  );

  const handleAddAndRun = () => {
    const originalInput = inputCode;
    const trimmed = originalInput.trim();
    if (!trimmed) {
      setError("Script cannot be empty.");
      return;
    }
    setError(null);

    const nowIso = new Date().toISOString();
    const newItem: ScriptHistoryItem = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      code: originalInput,
      createdAt: nowIso,
    };

    setHistory((prev) => {
      const next = [newItem, ...prev];
      saveHistoryToStorage(next);
      return next;
    });
    setCurrentScript(originalInput);

    const dateKey = nowIso.slice(0, 10);
    setExpandedDates((prev) => ({
      ...prev,
      [dateKey]: true,
    }));

    setIsExecuting(true);
    const execError = runUserInput(originalInput);
    setIsExecuting(false);
    if (execError) {
      setError(execError);
    }
    setInputCode("");
  };

  const handleReload = (item: ScriptHistoryItem) => {
    setInputCode(item.code);
    setCurrentScript(item.code);
    setError(null);

    setIsExecuting(true);
    const execError = runUserInput(item.code);
    setIsExecuting(false);
    if (execError) {
      setError(execError);
    }
  };

  const handleDelete = (item: ScriptHistoryItem) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h.id !== item.id);
      saveHistoryToStorage(next);
      return next;
    });

    if (currentScript === item.code) {
      setCurrentScript(null);
    }
  };

  const toggleDate = (dateKey: string) => {
    setExpandedDates((prev) => ({
      ...prev,
      [dateKey]: !prev[dateKey],
    }));
  };

  const handleLoadEmbed = () => {
    const trimmed = embedScript.trim();
    if (!trimmed) return;
    const err = injectEmbedScript(trimmed);
    if (err) {
      setError(err);
      return;
    }
    setIsEmbedLoaded(true);
    try {
      window.localStorage.setItem(LEAD_EMBED_KEY, trimmed);
    } catch {
      // ignore
    }
  };

  const handleRemoveEmbed = () => {
    if (embedScriptElementRef.current?.isConnected) {
      embedScriptElementRef.current.remove();
    }
    embedScriptElementRef.current = null;
    setEmbedScript("");
    setIsEmbedLoaded(false);
    try {
      window.localStorage.removeItem(LEAD_EMBED_KEY);
    } catch {
      // ignore
    }
  };

  const saveLeadButtons = (buttons: LeadButton[]) => {
    setLeadButtons(buttons);
    try {
      window.localStorage.setItem(LEAD_BUTTONS_KEY, JSON.stringify(buttons));
    } catch {
      // ignore
    }
  };

  const handleAddLeadButton = () => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    saveLeadButtons([...leadButtons, { id, name: "", formKey: "" }]);
  };

  const handleUpdateLeadButton = (
    id: string,
    field: "name" | "formKey",
    value: string,
  ) => {
    saveLeadButtons(
      leadButtons.map((b) => (b.id === id ? { ...b, [field]: value } : b)),
    );
  };

  const handleDeleteLeadButton = (id: string) => {
    saveLeadButtons(leadButtons.filter((b) => b.id !== id));
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 rounded-2xl bg-white p-6 shadow-sm dark:bg-zinc-950 sm:p-10">
        <nav className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab("agent")}
            className={`px-4 py-2.5 text-sm font-medium transition ${
              activeTab === "agent"
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Agent
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("website-lead-sources")}
            className={`px-4 py-2.5 text-sm font-medium transition ${
              activeTab === "website-lead-sources"
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Website Lead Sources
          </button>
        </nav>

        {activeTab === "agent" ? (
          <>
        <header className="flex flex-col gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Script Loader
          </h1>
          <p className="max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
            Paste JavaScript below and load it into this page. At any moment,
            only one script is active. Scripts execute in the context of this
            page and can access <code>window</code>, the console, and the DOM.
          </p>
          <p className="text-xs font-medium text-red-600 dark:text-red-400">
            Warning: Only run scripts you trust. They have full access to this
            page and your browser context.
          </p>
        </header>

        <section className="flex flex-col gap-8 md:flex-row">
          <div className="flex-1 space-y-3">
            <label
              htmlFor="script-input"
              className="flex items-center justify-between text-sm font-medium text-zinc-800 dark:text-zinc-200"
            >
              <span>Script</span>
              {currentScript && (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  Active script loaded
                </span>
              )}
            </label>
            <textarea
              id="script-input"
              className="h-64 w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-mono text-zinc-900 shadow-sm outline-none ring-0 transition focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500"
              placeholder='// Example: console.log("Hello from dynamic script");'
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
            />
            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={handleAddAndRun}
                disabled={isExecuting}
                className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-50 shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {isExecuting ? "Running…" : "Add & Run Script"}
              </button>
              {error && (
                <p className="flex-1 text-xs text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
            </div>
          </div>

          <div className="w-full max-w-md space-y-3 md:w-80">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Script history
            </h2>
            {history.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No scripts yet. Add a script to see it appear here, grouped by
                the date it was added.
              </p>
            ) : (
              <div className="space-y-2">
                {groupedHistory.map((group) => {
                  const isOpen = expandedDates[group.dateKey] ?? false;
                  return (
                    <div
                      key={group.dateKey}
                      className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <button
                        type="button"
                        onClick={() => toggleDate(group.dateKey)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
                      >
                        <span>{formatDateLabel(group.dateKey)}</span>
                        <span className="text-zinc-400">
                          {isOpen ? "▾" : "▸"}
                        </span>
                      </button>
                      {isOpen && (
                        <ul className="divide-y divide-zinc-200 border-t border-zinc-200 text-xs dark:divide-zinc-800 dark:border-zinc-800">
                          {group.items.map((item) => {
                            const isActive =
                              currentScript != null &&
                              currentScript === item.code;
                            const rawFirstLine =
                              item.code.split("\n").find((l) => l.trim()) ??
                              "(empty)";
                            const firstLine = rawFirstLine.startsWith("<script")
                              ? `<script …>`
                              : rawFirstLine;
                            return (
                              <li
                                key={item.id}
                                className={`flex items-start gap-2 px-3 py-2 ${
                                  isActive
                                    ? "bg-emerald-50/70 dark:bg-emerald-900/30"
                                    : "bg-zinc-50 dark:bg-zinc-900"
                                }`}
                              >
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="truncate font-mono text-[11px] text-zinc-800 dark:text-zinc-100">
                                      {firstLine.length > 80
                                        ? `${firstLine.slice(0, 80)}…`
                                        : firstLine}
                                    </span>
                                    <span className="whitespace-nowrap text-[10px] text-zinc-400">
                                      {formatTime(item.createdAt)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleReload(item)}
                                      className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                                    >
                                      Reload
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(item)}
                                      className="rounded-full border border-red-300 px-2 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                                    >
                                      Delete
                                    </button>
                                    {isActive && (
                                      <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                                        Active
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
          </>
        ) : (
          <div className="space-y-8">
            {/* Embed Script */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="embed-script-input"
                  className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
                >
                  Embed Script
                </label>
                {isEmbedLoaded && (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    Script loaded
                  </span>
                )}
              </div>
              <textarea
                id="embed-script-input"
                className="h-32 w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-mono text-zinc-900 shadow-sm outline-none ring-0 transition focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500"
                placeholder='<script src="https://example.com/embed.js"></script>'
                value={embedScript}
                onChange={(e) => setEmbedScript(e.target.value)}
                disabled={isEmbedLoaded}
              />
              <div className="flex gap-2">
                {!isEmbedLoaded ? (
                  <button
                    type="button"
                    onClick={handleLoadEmbed}
                    className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-50 shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    Load Script
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRemoveEmbed}
                    className="inline-flex items-center justify-center rounded-full border border-red-300 px-5 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    Remove Script
                  </button>
                )}
              </div>
            </div>

            {/* Lead Buttons */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Buttons
                </h2>
                <button
                  type="button"
                  onClick={handleAddLeadButton}
                  className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-medium text-zinc-50 shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  + Add Button
                </button>
              </div>

              {leadButtons.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No buttons yet. Add a button to configure its name and form
                  key.
                </p>
              ) : (
                <div className="space-y-3">
                  {leadButtons.map((btn) => (
                    <div
                      key={btn.id}
                      className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <input
                        type="text"
                        placeholder="Button name"
                        value={btn.name}
                        onChange={(e) =>
                          handleUpdateLeadButton(btn.id, "name", e.target.value)
                        }
                        className="flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-500"
                      />
                      <input
                        type="text"
                        placeholder="data-univlane-form-key"
                        value={btn.formKey}
                        onChange={(e) =>
                          handleUpdateLeadButton(
                            btn.id,
                            "formKey",
                            e.target.value,
                          )
                        }
                        className="flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm font-mono text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteLeadButton(btn.id)}
                        className="rounded-full border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Rendered Buttons */}
              {leadButtons.some((b) => b.name.trim()) && (
                <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                  <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Preview
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {leadButtons
                      .filter((b) => b.name.trim())
                      .map((btn) => (
                        <button
                          key={btn.id}
                          type="button"
                          data-univlane-form-key={btn.formKey}
                          className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-50 shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                          {btn.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

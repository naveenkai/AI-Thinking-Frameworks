/**
 * App — root component for the Thinking Frameworks application.
 *
 * Manages global state (settings, selected frameworks, question input)
 * and orchestrates the top-level layout: header, settings modal,
 * question bar, framework runner, and history overlay.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import SettingsModal from './components/SettingsModal';
import QuestionBar from './components/QuestionBar';
import FrameworkRunner from './components/FrameworkRunner';
import { FRAMEWORK_IDS, STORAGE_KEYS } from './utils/constants';

function App() {
  // Settings state (API key persisted in sessionStorage)
  const [settings, setSettings] = useState({
    apiKey: '',
    model: 'gpt-4o-mini',
    nSamples: 5,
    showCostEstimate: false,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Question + framework selection (persisted in localStorage)
  const loadSelected = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.frameworks);
      if (!raw) return new Set(FRAMEWORK_IDS);
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return new Set(FRAMEWORK_IDS);
      const set = new Set(arr.filter((id) => FRAMEWORK_IDS.includes(id)));
      return set.size > 0 ? set : new Set(FRAMEWORK_IDS);
    } catch {
      return new Set(FRAMEWORK_IDS);
    }
  };
  const [selected, setSelected] = useState(loadSelected);
  const [question, setQuestion] = useState('');

  // Run state — config drives FrameworkRunner
  const [config, setConfig] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  // Key to force re-mount FrameworkRunner on new runs
  const [runKey, setRunKey] = useState(0);
  const stopRef = useRef(null);

  const handleStop = useCallback(() => {
    if (stopRef.current) stopRef.current();
    setIsRunning(false);
  }, []);

  // Restore API key from sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEYS.apiKey);
    if (saved) setSettings((s) => ({ ...s, apiKey: saved }));
  }, []);

  const toggleFramework = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(STORAGE_KEYS.frameworks, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const handleSubmit = () => {
    if (!question.trim() || !settings.apiKey.trim() || selected.size === 0) return;
    setConfig({
      question: question.trim(),
      apiKey: settings.apiKey,
      model: settings.model,
      frameworks: [...selected],
      nSamples: settings.nSamples,
      showCostEstimate: settings.showCostEstimate,
    });
    setIsRunning(true);
    setRunKey((k) => k + 1);
  };

  const handleCloseSettings = useCallback(() => setSettingsOpen(false), []);
  const handleCloseHistory = useCallback(() => setHistoryOpen(false), []);

  const runHistory = historyOpen
    ? (() => {
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.runHistory);
          const list = raw ? JSON.parse(raw) : [];
          return Array.isArray(list) ? list : [];
        } catch {
          return [];
        }
      })()
    : [];

  const handleDone = () => {
    setIsRunning(false);
  };

  const handleNewQuestion = () => {
    setConfig(null);
    setIsRunning(false);
    setQuestion('');
  };

  return (
    <div className="App">
      {/* ── Compact Header ──────────────────────────── */}
      <header className="app-header-compact">
        <div className="header-left">
          <svg className="header-logo" width="26" height="26" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            {/* Central brain node */}
            <circle cx="50" cy="50" r="14" fill="#20808D" />
            <circle cx="50" cy="50" r="18" stroke="#20808D" strokeWidth="2" opacity="0.3" />
            {/* Branching paths to satellite nodes */}
            <line x1="50" y1="50" x2="22" y2="22" stroke="#20808D" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
            <line x1="50" y1="50" x2="82" y2="26" stroke="#20808D" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
            <line x1="50" y1="50" x2="26" y2="78" stroke="#20808D" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
            <line x1="50" y1="50" x2="80" y2="72" stroke="#20808D" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
            {/* Satellite nodes (4 frameworks) */}
            <circle cx="22" cy="22" r="8" fill="#5ba8c8" />
            <circle cx="82" cy="26" r="8" fill="#c9a256" />
            <circle cx="26" cy="78" r="8" fill="#6aad6e" />
            <circle cx="80" cy="72" r="8" fill="#8ab88c" />
          </svg>
          <h1>Agent Thinking Frameworks</h1>
          <span className="header-tag">Research</span>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="header-btn"
            onClick={() => setHistoryOpen(true)}
            title="Run history"
            aria-label="Run history"
          >
            History
          </button>
          <button
            type="button"
            className="header-btn"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            aria-label="Open settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── History overlay ───────────────────────────── */}
      {historyOpen && (
        <div
          className="history-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-title"
          onClick={(e) => e.target === e.currentTarget && setHistoryOpen(false)}
        >
          <div className="history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="history-header">
              <h3 id="history-title">Run history</h3>
              <button type="button" className="settings-close" onClick={handleCloseHistory} aria-label="Close history">&times;</button>
            </div>
            <div className="history-body">
              {runHistory.length === 0 ? (
                <p className="history-empty">No runs yet. Complete a run to see it here.</p>
              ) : (
                <ul className="history-list">
                  {runHistory.map((run) => (
                    <li key={run.id} className="history-item">
                      <div className="history-item-question" title={run.question}>
                        {run.question.length > 70 ? run.question.slice(0, 70) + '…' : run.question}
                      </div>
                      <div className="history-item-meta">
                        {new Date(run.timestamp).toLocaleString()} · {run.model}
                      </div>
                      <div className="history-item-answers">
                        {Object.entries(run.results || {}).map(([fw, r]) => (
                          r?.answer != null ? (
                            <span key={fw} className="history-fw-answer"><strong>{r.framework}:</strong> {(String(r.answer).length > 40 ? String(r.answer).slice(0, 40) + '…' : r.answer)}</span>
                          ) : r?.error ? (
                            <span key={fw} className="history-fw-error"><strong>{fw}:</strong> error</span>
                          ) : null
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Settings Modal ──────────────────────────── */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={handleCloseSettings}
        settings={settings}
        onSettingsChange={setSettings}
      />

      {/* ── Main Content ────────────────────────────── */}
      <main className="app-main">
        <QuestionBar
          question={question}
          onQuestionChange={setQuestion}
          selected={selected}
          onToggleFramework={toggleFramework}
          onSubmit={handleSubmit}
          isRunning={isRunning}
          apiKeySet={!!settings.apiKey.trim()}
        />

        {/* Results area */}
        {config && (
          <div className="results-area">
            <div className="results-toolbar">
              <span className="results-question">{config.question}</span>
              {isRunning && (
                <button className="stop-btn" onClick={handleStop} title="Stop all running frameworks">
                  <span className="stop-icon">■</span> Stop
                </button>
              )}
              {!isRunning && (
                <button className="new-question-btn" onClick={handleNewQuestion}>
                  New Question
                </button>
              )}
            </div>
            <FrameworkRunner key={runKey} config={config} onDone={handleDone} stopRef={stopRef} />
          </div>
        )}

        {/* Empty state */}
        {!config && (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <p>Enter a question and run to compare reasoning frameworks side-by-side</p>
            {!settings.apiKey && (
              <button className="empty-settings-btn" onClick={() => setSettingsOpen(true)}>
                Set API Key
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

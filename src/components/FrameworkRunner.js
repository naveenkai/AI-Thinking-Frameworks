/**
 * FrameworkRunner — orchestrates all selected reasoning frameworks in parallel.
 *
 * Responsibilities:
 * - Launches selected frameworks concurrently with a shared AbortController
 * - Tracks per-framework progress (streaming steps) and final results
 * - Persists run history to localStorage (last N runs)
 * - Exposes a stop handle to parent via `stopRef`
 * - Renders framework panels + comparison table when complete
 *
 * @param {object}  props
 * @param {object}  props.config  - { question, apiKey, model, frameworks, nSamples, showCostEstimate }
 * @param {function} props.onDone - Called when all frameworks finish (or are stopped)
 * @param {object}  props.stopRef - React ref; `.current` is set to a stop callback
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { runCoT } from '../frameworks/cot';
import { runReAct } from '../frameworks/react';
import { runReWOO } from '../frameworks/rewoo';
import { runPlanExecute } from '../frameworks/planExecute';
import CotPanel from './cot/CotPanel';
import ReactPanel from './react-agent/ReactPanel';
import RewooPanel from './rewoo/RewooPanel';
import PlanExecPanel from './plan-execute/PlanExecPanel';
import ResultsComparison from './ResultsComparison';
import { STORAGE_KEYS, RUN_HISTORY_MAX } from '../utils/constants';

// ── Framework registry ───────────────────────────────────────────
// Maps framework IDs to their runner functions, extra options builders,
// display names, progress adapters, and panel components.

const REGISTRY = {
  cot: {
    run: runCoT,
    extraOpts: (cfg) => ({ nSamples: cfg.nSamples }),
    onProgress: (updateProgress, fw) => (i, path) => {
      updateProgress(fw, { type: 'path', index: i, content: path });
    },
    name: 'CoT',
    Panel: CotPanel,
  },
  react: {
    run: runReAct,
    extraOpts: () => ({}),
    onProgress: (updateProgress, fw) => (step) => updateProgress(fw, step),
    name: 'ReAct',
    Panel: ReactPanel,
  },
  rewoo: {
    run: runReWOO,
    extraOpts: () => ({}),
    onProgress: (updateProgress, fw) => (step) => updateProgress(fw, step),
    name: 'ReWOO',
    Panel: RewooPanel,
  },
  'plan-execute': {
    run: runPlanExecute,
    extraOpts: () => ({}),
    onProgress: (updateProgress, fw) => (step) => updateProgress(fw, step),
    name: 'Plan-Execute',
    Panel: PlanExecPanel,
  },
};

export default function FrameworkRunner({ config, onDone, stopRef }) {
  const { question, apiKey, model, frameworks, nSamples } = config;

  const [results, setResults] = useState({});
  const [progress, setProgress] = useState({});
  const [running, setRunning] = useState(true);
  const [error, setError] = useState(null);
  const [stopped, setStopped] = useState(false);
  const persistedRef = useRef(false);
  const controllerRef = useRef(null);

  const updateProgress = useCallback((fw, data) => {
    setProgress((prev) => ({
      ...prev,
      [fw]: [...(prev[fw] || []), data],
    }));
  }, []);

  // Expose stop function to parent via stopRef
  useEffect(() => {
    if (stopRef) {
      stopRef.current = () => {
        if (controllerRef.current) {
          controllerRef.current.abort();
          setStopped(true);
          setRunning(false);
          if (onDone) onDone();
        }
      };
    }
    return () => {
      if (stopRef) stopRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopRef]);

  // ── Launch all selected frameworks in parallel ───────────────
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    controllerRef.current = controller;
    const signal = controller.signal;

    function isAbort(e) {
      return e.name === 'AbortError' || e.message?.includes('aborted');
    }

    async function run() {
      const promises = frameworks
        .filter((fw) => REGISTRY[fw])
        .map((fw) => {
          const entry = REGISTRY[fw];
          const opts = { apiKey, model, signal, ...entry.extraOpts(config) };
          const progressCb = entry.onProgress(
            (fwId, data) => { if (!cancelled) updateProgress(fwId, data); },
            fw
          );

          return entry.run(question, opts, progressCb)
            .then((r) => {
              if (!cancelled) setResults((p) => ({ ...p, [fw]: r }));
            })
            .catch((e) => {
              if (cancelled) return;
              if (isAbort(e)) {
                setResults((p) => ({
                  ...p,
                  [fw]: p[fw] || { error: 'Stopped by user', stopped: true, framework: entry.name },
                }));
              } else {
                setResults((p) => ({ ...p, [fw]: { error: e.message, framework: entry.name } }));
              }
            });
        });

      try {
        await Promise.all(promises);
      } catch (e) {
        if (!cancelled && !isAbort(e)) setError(e.message);
      }
      if (!cancelled) {
        setRunning(false);
        if (onDone) onDone();
      }
    }

    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist run history ──────────────────────────────────────
  const completedResults = Object.values(results).filter((r) => r && !r.error);

  useEffect(() => {
    const allDone = frameworks.every((fw) => results[fw] !== undefined);
    if (running || completedResults.length === 0 || !allDone || persistedRef.current) return;
    persistedRef.current = true;

    const runRecord = {
      id: Date.now(),
      question,
      model,
      timestamp: new Date().toISOString(),
      frameworks: [...frameworks],
      results: Object.fromEntries(
        Object.entries(results).map(([k, r]) => [
          k,
          r && !r.error
            ? { framework: r.framework, answer: r.answer ?? r.finalAnswer, total_tokens: r.usage?.total_tokens, timeMs: r.timeMs }
            : { error: r?.error },
        ])
      ),
    };

    try {
      const raw = localStorage.getItem(STORAGE_KEYS.runHistory);
      const list = raw ? JSON.parse(raw) : [];
      const next = [runRecord, ...list].slice(0, RUN_HISTORY_MAX);
      localStorage.setItem(STORAGE_KEYS.runHistory, JSON.stringify(next));
    } catch (_) { /* localStorage may be full or disabled */ }
  }, [running, question, model, frameworks, results, completedResults.length]);

  // ── Export handler ───────────────────────────────────────────
  const handleExportRun = useCallback(() => {
    const payload = {
      question,
      model,
      nSamples,
      frameworks: [...frameworks],
      timestamp: new Date().toISOString(),
      results,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `thinking-frameworks-run-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [question, model, nSamples, frameworks, results]);

  const showResults = !running && (completedResults.length > 0 || stopped);

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="framework-runner">
      {error && <div className="error-banner">{error}</div>}

      <div className={`panels-grid panels-grid-${frameworks.length}`}>
        {frameworks.map((fw) => {
          const entry = REGISTRY[fw];
          if (!entry) return null;
          const Panel = entry.Panel;
          return (
            <Panel
              key={fw}
              result={results[fw]}
              progress={progress[fw] || []}
            />
          );
        })}
      </div>

      {showResults && (
        <>
          <div className="results-comparison-toolbar">
            <button type="button" className="export-run-btn" onClick={handleExportRun}>
              Export run (JSON)
            </button>
          </div>
          <ResultsComparison results={results} config={config} />
        </>
      )}
    </div>
  );
}

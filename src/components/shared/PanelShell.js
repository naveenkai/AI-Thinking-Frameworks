/**
 * PanelShell — shared wrapper for all framework panels.
 *
 * Handles the repetitive chrome that every panel needs:
 * - Loading skeleton (when no data yet)
 * - Error state (when framework fails entirely)
 * - Header with title, badge, running indicator, and elapsed time
 * - Scrollable body slot for framework-specific content
 * - Stats bar at the bottom
 *
 * @param {object} props
 * @param {string}   props.id          - CSS class suffix, e.g. "cot" → "cot-panel"
 * @param {string}   props.title       - Framework name, e.g. "CoT"
 * @param {string}   props.badge       - Badge text, e.g. "Chain-of-Thought"
 * @param {object}   [props.result]    - Framework result object (null while running)
 * @param {boolean}  props.isRunning   - Whether the framework is currently executing
 * @param {string}   [props.errorKey]  - Key to check for "error-only" state (e.g. "paths", "trajectory")
 * @param {Array<{label:string, value:string|number}>} [props.stats] - Stats for the footer bar
 * @param {React.ReactNode} props.children - Framework-specific body content
 */
import React from 'react';

export default React.memo(function PanelShell({
  id,
  title,
  badge,
  result,
  isRunning,
  errorKey,
  stats,
  children,
}) {
  // Loading skeleton — no result and not running yet (initial state)
  if (!result && !isRunning) {
    return (
      <div className={`panel ${id}-panel`}>
        <div className="panel-header">
          <h3>{title} <span className="badge">{badge}</span></h3>
        </div>
        <div className="panel-loading">
          <div className="skeleton-line skeleton-w80" />
          <div className="skeleton-line skeleton-w60" />
          <div className="skeleton-line skeleton-w90" />
          <div className="skeleton-line skeleton-w40" />
        </div>
      </div>
    );
  }

  // Error-only state — result has error but no data
  if (result?.error && errorKey && !result?.[errorKey]) {
    return (
      <div className={`panel ${id}-panel`}>
        <div className="panel-header"><h3>{title}</h3></div>
        <div className="panel-error">{result.error}</div>
      </div>
    );
  }

  return (
    <div className={`panel ${id}-panel`}>
      <div className="panel-header">
        <h3>{title} <span className="badge">{badge}</span></h3>
        <span className="panel-header-right">
          {isRunning && <span className="panel-running" aria-live="polite">Running&hellip;</span>}
          {result && <span className="panel-time">{(result.timeMs / 1000).toFixed(1)}s</span>}
        </span>
      </div>

      <div className="panel-body">
        {children}
      </div>

      {result && stats && stats.length > 0 && (
        <div className="panel-stats">
          {stats.map((s) => (
            <div key={s.label} className="stat-item">
              <span className="stat-label">{s.label}</span>
              <span className="stat-value">{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

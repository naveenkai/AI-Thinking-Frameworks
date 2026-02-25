/**
 * ResultsComparison — comparison table shown after all frameworks complete.
 *
 * Displays a side-by-side table of answers, token usage, cost estimates,
 * and timing. Includes an "Insights" section highlighting agreement,
 * speed, and cost differences.
 *
 * @param {object} props
 * @param {object} props.results - Map of framework ID → result object
 * @param {object} props.config  - Run configuration (model, showCostEstimate, etc.)
 */
import React, { useState, useCallback } from 'react';
import { MODEL_PRICING } from '../utils/constants';

/** Expandable/copyable answer cell within the comparison table. */
const AnswerCell = React.memo(function AnswerCell({ text, hasError }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  const isNull = text == null || String(text).trim() === '';
  const str = isNull ? 'No answer' : String(text).trim();
  const isLong = str.length > 60;

  return (
    <td className={`answer-cell-wrapper${isNull ? ' answer-cell-null' : ''}`}>
      <div className={`answer-cell-content ${expanded ? 'answer-cell-expanded' : ''}`}>
        <span className="answer-cell-text" onClick={isLong ? () => setExpanded((e) => !e) : undefined} title={str}>
          {expanded ? str : isLong ? str.slice(0, 60) + '…' : str}
        </span>
        {hasError && <span className="answer-error-badge">error</span>}
      </div>
      <div className="answer-cell-actions">
        {isLong && (
          <button type="button" className="answer-cell-toggle" onClick={() => setExpanded((e) => !e)} aria-label={expanded ? 'Collapse' : 'Expand'}>
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        )}
        {!isNull && (
          <button type="button" className="answer-cell-copy" onClick={copy} aria-label="Copy answer">
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </td>
  );
});

/** Estimate cost in USD based on token usage and model pricing. */
function estimateCost(usage, model) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini'];
  const inTokens = usage?.prompt_tokens ?? 0;
  const outTokens = usage?.completion_tokens ?? 0;
  return (inTokens * pricing.input + outTokens * pricing.output) / 1e6;
}

export default function ResultsComparison({ results, config }) {
  // Include results that have answers OR have data (even with errors)
  const entries = Object.entries(results).filter(
    ([, r]) => r && (r.answer != null || r.finalAnswer != null || r.error)
  );
  const showCost = !!config?.showCostEstimate;
  const model = config?.model || 'gpt-4o-mini';

  if (entries.length === 0) return null;

  return (
    <div className="results-comparison">
      <h3>Comparison</h3>
      <table className="comparison-table">
        <thead>
          <tr>
            <th>Framework</th>
            <th>Answer</th>
            <th>LLM Calls</th>
            <th>Total Tokens</th>
            {showCost && <th>Est. cost</th>}
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, r]) => {
            const answer = r.answer || r.finalAnswer;
            const hasError = !!r.error;
            return (
              <tr key={key}>
                <td className="fw-cell">{r.framework || key}</td>
                <AnswerCell text={answer} hasError={hasError} />
                <td>{r.llmCalls ?? '—'}</td>
                <td>{r.usage?.total_tokens || '—'}</td>
                {showCost && (
                  <td>
                    {r.usage ? `$${estimateCost(r.usage, model).toFixed(4)}` : '—'}
                  </td>
                )}
                <td>{r.timeMs ? (r.timeMs / 1000).toFixed(1) + 's' : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {entries.length > 1 && (
        <div className="comparison-insights">
          <h4>Insights</h4>
          <ul>
            {(() => {
              const insights = [];

              // Token comparison
              const withTokens = entries.filter(([, r]) => r.usage?.total_tokens);
              if (withTokens.length > 1) {
                const byTokens = [...withTokens].sort((a, b) => (a[1].usage?.total_tokens || 0) - (b[1].usage?.total_tokens || 0));
                const cheapest = byTokens[0][1];
                const costliest = byTokens[byTokens.length - 1][1];
                if (cheapest.framework !== costliest.framework) {
                  insights.push(
                    <li key="tokens">
                      <strong>{cheapest.framework}</strong> used the fewest tokens ({cheapest.usage?.total_tokens}),
                      while <strong>{costliest.framework}</strong> used the most ({costliest.usage?.total_tokens}).
                    </li>
                  );
                }
              }

              // Speed comparison
              const withTime = entries.filter(([, r]) => r.timeMs != null);
              if (withTime.length > 0) {
                const byTime = [...withTime].sort((a, b) => (a[1].timeMs || 0) - (b[1].timeMs || 0));
                const fastest = byTime[0][1];
                insights.push(
                  <li key="time">
                    <strong>{fastest.framework}</strong> was fastest at {(fastest.timeMs / 1000).toFixed(1)}s.
                  </li>
                );
              }

              // Answer agreement
              const answeredEntries = entries.filter(([, r]) => (r.answer || r.finalAnswer) != null);
              const failedEntries = entries.filter(([, r]) => (r.answer || r.finalAnswer) == null);
              if (answeredEntries.length > 0) {
                const answers = answeredEntries.map(([, r]) => String(r.answer || r.finalAnswer || '').toLowerCase().trim());
                const allSame = answers.length > 1 && answers.every((a) => a === answers[0]);
                insights.push(
                  <li key="agree">
                    {allSame
                      ? 'All frameworks agreed on the answer.'
                      : answers.length > 1
                        ? 'Frameworks produced different answers — worth investigating!'
                        : 'Only one framework produced an answer.'}
                  </li>
                );
              }

              if (failedEntries.length > 0) {
                insights.push(
                  <li key="failed">
                    {failedEntries.length} framework{failedEntries.length > 1 ? 's' : ''} failed to produce an answer.
                  </li>
                );
              }

              return insights;
            })()}
          </ul>
        </div>
      )}
    </div>
  );
}

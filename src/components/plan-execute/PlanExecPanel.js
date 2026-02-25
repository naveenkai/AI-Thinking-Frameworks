/**
 * PlanExecPanel — displays Plan-and-Execute framework results.
 *
 * Shows:
 * - Initial plan (rendered as markdown)
 * - Execution steps with results
 * - Replan count
 * - Final answer or error
 *
 * @param {object}  props
 * @param {object}  [props.result]   - PlanExecuteResult object (null while running)
 * @param {Array}   props.progress   - Streaming phase events
 */
import React from 'react';
import PanelShell from '../shared/PanelShell';
import MarkdownContent from '../MarkdownContent';
import { FRAMEWORKS } from '../../utils/constants';

const META = FRAMEWORKS.find((f) => f.id === 'plan-execute');

export default function PlanExecPanel({ result, progress = [] }) {
  const planEvent = progress.find((p) => p.phase === 'plan');
  const execEvents = progress.filter((p) => p.phase === 'execute-done');
  const replanEvents = progress.filter((p) => p.phase === 'replan');
  const doneEvent = progress.find((p) => p.phase === 'done');
  const isRunning = !result && progress.length > 0;

  const stats = result ? [
    { label: 'LLM calls', value: result.llmCalls },
    { label: 'Tokens', value: result.usage?.total_tokens ?? '—' },
    { label: 'Replans', value: result.replans },
  ] : null;

  return (
    <PanelShell
      id="planexec"
      title={META.fullName}
      badge={META.badge}
      result={result}
      isRunning={isRunning || progress.length > 0}
      errorKey="pastSteps"
      stats={stats}
    >
      {/* Initial Plan */}
      {(planEvent || result) && (
        <div className="pe-phase">
          <div className="phase-label">Initial Plan</div>
          <div className="plan-text">
            <MarkdownContent content={planEvent?.data?.planText || result?.planText} />
          </div>
        </div>
      )}

      {/* Execution Steps */}
      <div className="pe-phase">
        <div className="phase-label">Execution</div>
        <div className="pe-steps">
          {(result ? (result.pastSteps || []) : execEvents.map((e) => [e.data.step, e.data.result])).map(
            ([step, stepResult], i) => {
              const strResult = String(stepResult);
              const isError = strResult.startsWith('[Error:');
              return (
                <div key={i} className={`pe-step${isError ? ' pe-step-error' : ''}`}>
                  <div className="pe-step-label">
                    Step {i + 1}: {step}
                    {isError && <span className="step-error-icon">⚠</span>}
                  </div>
                  <div className="pe-step-result">
                    <MarkdownContent content={strResult.length > 300
                      ? strResult.slice(0, 300) + '...'
                      : strResult} />
                  </div>
                </div>
              );
            }
          )}
        </div>
      </div>

      {/* Replanning Events */}
      {(replanEvents.length > 0 || (result && result.replans > 0)) && (
        <div className="pe-phase">
          <div className="phase-label">Replanned {result?.replans || replanEvents.length} time(s)</div>
        </div>
      )}

      {/* Final Answer or Error */}
      {(doneEvent || result) && (
        result?.error && !result?.answer ? (
          <div className="error-info">
            <span className="answer-label">Error:</span> {result.error}
          </div>
        ) : result?.answer != null ? (
          <div className="final-answer">
            <span className="answer-label">Final Answer:</span>
            <MarkdownContent content={result?.answer || doneEvent?.data?.answer} />
          </div>
        ) : (
          <div className="final-answer final-answer-null">
            No answer produced
          </div>
        )
      )}
    </PanelShell>
  );
}

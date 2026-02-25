/**
 * RewooPanel — displays ReWOO (Reasoning Without Observation) results.
 *
 * Shows the 3-phase pipeline:
 * 1. Planner — step variables and tool calls
 * 2. Worker — evidence gathered per variable
 * 3. Solver — final answer synthesized from evidence
 *
 * @param {object}  props
 * @param {object}  [props.result]   - ReWOOResult object (null while running)
 * @param {Array}   props.progress   - Streaming phase events
 */
import React from 'react';
import PanelShell from '../shared/PanelShell';
import MarkdownContent from '../MarkdownContent';
import { FRAMEWORKS } from '../../utils/constants';

const META = FRAMEWORKS.find((f) => f.id === 'rewoo');

export default function RewooPanel({ result, progress = [] }) {
  const planData = progress.find((p) => p.phase === 'plan')?.data
    || (result ? { steps: result.steps, planText: result.planText } : null);
  const evidenceItems = progress.filter((p) => p.phase === 'evidence').map((p) => p.data);
  const solveData = progress.find((p) => p.phase === 'solve')?.data;
  const isRunning = !result && progress.length > 0;

  const stats = result ? [
    { label: 'LLM calls', value: result.llmCalls },
    { label: 'Tokens', value: result.usage?.total_tokens ?? '—' },
    { label: 'Steps', value: result.steps?.length ?? '—' },
  ] : null;

  return (
    <PanelShell
      id="rewoo"
      title={META.label}
      badge={META.badge}
      result={result}
      isRunning={isRunning || progress.length > 0}
      errorKey="steps"
      stats={stats}
    >
      {/* Phase 1: Plan */}
      {planData && (
        <div className="rewoo-phase">
          <div className="phase-label">Phase 1: Planner (1 LLM call)</div>
          <div className="rewoo-plan">
            {(planData.steps || []).map((step, i) => (
              <div key={i} className="plan-step">
                <span className="ev-var">{step.variable}</span>
                <span className="plan-tool">{step.tool}[{step.toolInput}]</span>
                <div className="plan-desc">{step.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase 2: Worker */}
      {(evidenceItems.length > 0 || result?.evidence) && (
        <div className="rewoo-phase">
          <div className="phase-label">Phase 2: Worker (0 LLM calls)</div>
          <div className="rewoo-evidence">
            {(result ? Object.entries(result.evidence) : evidenceItems.map((e) => [e.variable, e.result])).map(
              ([varName, value], i) => {
                const strVal = String(value);
                const isFailed = strVal.startsWith('[FAILED:');
                return (
                  <div key={i} className={`evidence-item${isFailed ? ' evidence-item-failed' : ''}`}>
                    <span className="ev-var">{varName}</span>
                    <span className="ev-value">
                      {isFailed && <span className="evidence-fail-icon">⚠</span>}
                      <MarkdownContent content={strVal.length > 200 ? strVal.slice(0, 200) + '...' : strVal} />
                    </span>
                  </div>
                );
              }
            )}
          </div>
        </div>
      )}

      {/* Phase 3: Solver */}
      {(solveData || result) && (
        <div className="rewoo-phase">
          <div className="phase-label">Phase 3: Solver (1 LLM call)</div>
          <div className="final-answer">
            <span className="answer-label">Final Answer:</span>
            <MarkdownContent content={result?.answer || solveData?.answer} />
          </div>
        </div>
      )}
    </PanelShell>
  );
}

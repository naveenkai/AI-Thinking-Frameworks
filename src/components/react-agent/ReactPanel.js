/**
 * ReactPanel — displays ReAct (Reasoning + Acting) agent trajectory.
 *
 * Shows a timeline of Thought → Action → Observation turns, with each
 * segment rendered through MarkdownContent for proper formatting.
 *
 * @param {object}  props
 * @param {object}  [props.result]   - ReActResult object (null while running)
 * @param {Array}   props.progress   - Streaming step events
 */
import React from 'react';
import PanelShell from '../shared/PanelShell';
import MarkdownContent from '../MarkdownContent';
import { FRAMEWORKS } from '../../utils/constants';

const META = FRAMEWORKS.find((f) => f.id === 'react');

/**
 * Classify LLM response text into labeled segments (thought, action, answer, text).
 * Groups consecutive continuation lines into the same block to preserve
 * multi-line markdown formatting.
 *
 * @param {string} text - Raw LLM response
 * @returns {Array<{type: string, text: string}>}
 */
function classifyContent(text) {
  if (!text) return [];
  const segments = [];
  const lines = text.split('\n');
  let current = null;

  for (const line of lines) {
    if (line.match(/^Thought:/i)) {
      if (current) segments.push(current);
      current = { type: 'thought', text: line };
    } else if (line.match(/^Action:/i)) {
      if (current) segments.push(current);
      current = { type: 'action', text: line };
    } else if (line.match(/^Answer:/i)) {
      if (current) segments.push(current);
      current = { type: 'answer', text: line };
    } else if (line.match(/^PAUSE/i)) {
      if (current) segments.push(current);
      current = null;
    } else {
      if (current) {
        current.text += '\n' + line;
      } else if (line.trim()) {
        current = { type: 'text', text: line };
      }
    }
  }
  if (current) segments.push(current);
  return segments;
}

export default function ReactPanel({ result, progress = [] }) {
  const steps = result ? result.trajectory : progress;
  const isRunning = !result && progress.length > 0;

  const stats = result ? [
    { label: 'Turns', value: result.turns },
    { label: 'LLM calls', value: result.llmCalls },
    { label: 'Tokens', value: result.usage?.total_tokens ?? '—' },
  ] : null;

  return (
    <PanelShell
      id="react"
      title={META.label}
      badge={META.badge}
      result={result}
      isRunning={isRunning || progress.length > 0}
      errorKey="trajectory"
      stats={stats}
    >
      {/* Truncation warning */}
      {result?.truncated && (
        <div className="truncation-warning">
          ⚠ Agent exceeded maximum turns — answer below may be incomplete.
        </div>
      )}

      <div className="react-timeline">
        {steps.map((step, i) => {
          if (step.role === 'assistant' || step.type === 'llm') {
            const segments = classifyContent(step.content);
            return (
              <div key={i} className="timeline-step">
                <div className="step-turn">Turn {step.turn || Math.ceil((i + 1) / 2)}</div>
                {segments.map((seg, j) => (
                  <div key={j} className={`segment segment-${seg.type}`}>
                    <MarkdownContent content={seg.text} />
                  </div>
                ))}
              </div>
            );
          }
          if (step.role === 'observation' || step.type === 'observation') {
            const obsContent = step.content.length > 500
              ? step.content.slice(0, 500) + '...'
              : step.content;
            return (
              <div key={i} className="timeline-step observation-step">
                <div className="segment segment-observation">
                  <MarkdownContent content={obsContent} />
                </div>
              </div>
            );
          }
          return null;
        })}
      </div>

      {result && (
        <div className="react-results">
          {result.answer != null ? (
            <div className="final-answer">
              <span className="answer-label">Final Answer:</span>
              <MarkdownContent content={result.answer} />
            </div>
          ) : result.error ? (
            <div className="error-info">
              <span className="answer-label">Error:</span> {result.error}
            </div>
          ) : (
            <div className="final-answer final-answer-null">
              No answer produced
            </div>
          )}
        </div>
      )}
    </PanelShell>
  );
}

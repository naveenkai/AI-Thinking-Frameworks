/**
 * CotPanel — displays Chain-of-Thought (Self-Consistency) results.
 *
 * Renders differently based on question type:
 * - **Factual**: majority vote bars with confidence percentage
 * - **Open-ended**: synthesized answer from multiple reasoning paths
 *
 * @param {object}  props
 * @param {object}  [props.result]   - CoTResult object (null while running)
 * @param {Array}   props.progress   - Streaming path completions
 */
import React, { useState } from 'react';
import PanelShell from '../shared/PanelShell';
import MarkdownContent from '../MarkdownContent';
import { FRAMEWORKS } from '../../utils/constants';

const META = FRAMEWORKS.find((f) => f.id === 'cot');

export default function CotPanel({ result, progress = [] }) {
  const [expandedPath, setExpandedPath] = useState(null);

  const isRunning = !result && progress.length > 0;
  const pathCount = result ? (result.paths?.length || 0) : progress.length;
  const isOpenEnded = result?.questionType === 'open-ended';

  const stats = result ? [
    { label: 'LLM calls', value: result.llmCalls },
    { label: 'Tokens', value: result.usage?.total_tokens ?? '—' },
    { label: isOpenEnded ? 'Mode' : 'Confidence', value: isOpenEnded ? 'Synthesis' : `${(result.confidence * 100).toFixed(0)}%` },
  ] : null;

  return (
    <PanelShell
      id="cot"
      title={META.label}
      badge={isOpenEnded ? 'Synthesis' : META.badge}
      result={result}
      isRunning={isRunning || progress.length > 0}
      errorKey="paths"
      stats={stats}
    >
      {/* Reasoning paths (expandable) */}
      <div className="cot-paths">
        <div className="paths-header">
          {pathCount} reasoning path{pathCount !== 1 ? 's' : ''} sampled
          {isOpenEnded && <span className="paths-header-mode"> · open-ended → synthesized</span>}
          {result?.questionType === 'factual' && <span className="paths-header-mode"> · factual → majority vote</span>}
        </div>
        {(result ? (result.paths || []) : progress.map((p) => p.content)).map((path, i) => (
          <div key={i} className="cot-path-item" onClick={() => setExpandedPath(expandedPath === i ? null : i)}>
            <div className="path-label">
              Path {i + 1}
              {result && !isOpenEnded && (
                result.answers[i] != null
                  ? <span className="path-answer">= {result.answers[i]}</span>
                  : <span className="path-answer path-answer-null">no answer extracted</span>
              )}
            </div>
            {expandedPath === i && (
              <pre className="path-content">{path}</pre>
            )}
          </div>
        ))}
      </div>

      {/* Results — different rendering based on question type */}
      {result && (
        <div className="cot-results">
          {/* FACTUAL: Majority vote */}
          {!isOpenEnded && (
            <>
              <div className="vote-section">
                <div className="vote-title">Majority Vote</div>
                <div className="vote-bars">
                  {Object.entries(result.voteCounts || {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([answer, count]) => (
                      <div key={answer} className="vote-bar-row">
                        <span className="vote-answer">{answer}</span>
                        <div className="vote-bar" style={{ width: `${(count / result.paths.length) * 100}%` }}>
                          {count}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {result.extractionFailures > 0 && (
                <div className="extraction-warning">
                  {result.extractionFailures} of {result.paths.length} paths failed answer extraction
                </div>
              )}

              <div className="final-answer">
                <span className="answer-label">Final Answer:</span>
                <span className="confidence">({(result.confidence * 100).toFixed(0)}% confidence)</span>
                <MarkdownContent content={result.finalAnswer || result.answer} />
              </div>
            </>
          )}

          {/* OPEN-ENDED: Synthesized answer */}
          {isOpenEnded && (
            <div className="synthesis-section">
              <div className="synthesis-title">
                <span className="synthesis-icon">✦</span> Synthesized from {result.paths.length} reasoning paths
              </div>
              <div className="synthesis-answer">
                <MarkdownContent content={result.synthesizedAnswer || result.answer} />
              </div>
            </div>
          )}
        </div>
      )}
    </PanelShell>
  );
}

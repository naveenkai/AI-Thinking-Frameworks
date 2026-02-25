/**
 * QuestionBar — input area with framework selection pills and sample questions.
 *
 * @param {object}  props
 * @param {string}  props.question          - Current question text
 * @param {function} props.onQuestionChange - Sets question text
 * @param {Set}     props.selected          - Selected framework IDs
 * @param {function} props.onToggleFramework - Toggles a framework on/off
 * @param {function} props.onSubmit         - Fires when user submits
 * @param {boolean} props.isRunning         - Disables input while running
 * @param {boolean} props.apiKeySet         - Whether API key is configured
 */
import React, { useRef, useEffect } from 'react';
import { FRAMEWORKS, SAMPLE_QUESTIONS } from '../utils/constants';

export default function QuestionBar({
  question,
  onQuestionChange,
  selected,
  onToggleFramework,
  onSubmit,
  isRunning,
  apiKeySet,
}) {
  const textareaRef = useRef(null);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 150) + 'px';
    }
  }, [question]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!question.trim() || !apiKeySet || selected.size === 0 || isRunning) return;
    onSubmit();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="question-bar-container">
      <form className="question-bar" onSubmit={handleSubmit}>
        <div className="search-box">
          <textarea
            ref={textareaRef}
            className="question-input"
            value={question}
            onChange={(e) => onQuestionChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={apiKeySet ? 'What would you like to explore?' : 'Set your API key in Settings first...'}
            rows={1}
            disabled={!apiKeySet}
          />
          <button
            type="submit"
            className="run-btn-compact"
            disabled={isRunning || !question.trim() || !apiKeySet || selected.size === 0}
          >
            {isRunning ? (
              <span className="run-spinner" />
            ) : (
              'Run'
            )}
          </button>
        </div>
      </form>

      <div className="framework-pills">
        {FRAMEWORKS.map((fw) => (
          <button
            key={fw.id}
            type="button"
            className={`fw-pill ${selected.has(fw.id) ? 'fw-pill-active' : ''}`}
            onClick={() => onToggleFramework(fw.id)}
          >
            {fw.label}
          </button>
        ))}
      </div>

      {!question && (
        <div className="sample-questions">
          {SAMPLE_QUESTIONS.map((q, i) => (
            <button key={i} type="button" className="sample-btn" onClick={() => onQuestionChange(q)}>
              {q.length > 55 ? q.slice(0, 55) + '...' : q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

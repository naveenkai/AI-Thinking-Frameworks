/**
 * MarkdownContent — shared markdown renderer for all LLM output.
 *
 * Renders markdown (headings, bold, lists, code blocks, tables) within
 * the dark theme. Uses remark-gfm for GitHub Flavored Markdown support
 * (tables, strikethrough, task lists, autolinks).
 *
 * Wrapped in React.memo to prevent unnecessary re-renders — this component
 * is used heavily across all panels (often dozens of times per panel).
 *
 * @param {object}  props
 * @param {string}  props.content   - Markdown text to render
 * @param {string}  [props.className] - Additional CSS class
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default React.memo(function MarkdownContent({ content, className }) {
  if (!content) return null;

  return (
    <div className={`md-content ${className || ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
});

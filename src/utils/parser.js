/**
 * Regex parsers for extracting structured data from LLM outputs.
 *
 * Each parser is designed for a specific framework's output format.
 * All parsers return null (or empty array) on failure — they never throw.
 *
 * @module parser
 */

/**
 * Extract the final answer from a CoT reasoning path.
 * Tries multiple patterns: "The answer is X", "#### X", "Therefore X", "Answer: X".
 * Cleans up extraction artifacts like repeated "the answer is" phrases.
 *
 * @param {string} text - Full reasoning path text
 * @returns {string|null} Extracted answer or null if no answer found
 */
export function extractAnswer(text) {
  if (!text) return null;

  let answer = null;

  // 1. "The answer is <answer>" — broad capture (text + numbers)
  const match = text.match(/[Tt]he answer is\s+(.+?)\.?\s*$/m);
  if (match) answer = match[1].replace(/,/g, '').trim();

  // 2. "#### <answer>" (GSM8K format)
  if (!answer) {
    const hashMatch = text.match(/####\s*(.+)/);
    if (hashMatch) answer = hashMatch[1].trim();
  }

  // 3. Conclusion patterns: "Therefore/Thus/So/Hence, <answer>"
  if (!answer) {
    const conclusionMatch = text.match(/(?:therefore|thus|so|hence),?\s+(?:the answer is\s+)?(.+?)\.?\s*$/im);
    if (conclusionMatch) answer = conclusionMatch[1].trim();
  }

  // 4. "Final answer: <answer>" or "Answer: <answer>"
  if (!answer) {
    const answerLabel = text.match(/(?:final\s+)?answer:\s*(.+?)\.?\s*$/im);
    if (answerLabel) answer = answerLabel[1].trim();
  }

  if (!answer) return null;

  // Clean up extraction artifacts: strip embedded repeated "the answer is ..." phrases
  answer = answer.replace(/\.?\s*[Tt]he answer is\s+.*$/, '').trim();
  // Remove trailing punctuation
  answer = answer.replace(/[.]+$/, '').trim();

  return answer || null;
}

/**
 * Parse a ReAct action line: "Action: tool_name: input ... PAUSE".
 * @param {string} text - LLM response text
 * @returns {{ actionName: string, actionInput: string } | null}
 */
export function parseReActAction(text) {
  // Capture everything after "Action: tool:" until PAUSE or end of text
  const actionMatch = text.match(/^Action:\s*(\w+):\s*([\s\S]*?)(?=\nPAUSE|\n*$)/m);
  if (actionMatch) {
    return { actionName: actionMatch[1].trim(), actionInput: actionMatch[2].trim() };
  }
  return null;
}

/**
 * Check for a ReAct final answer: "Answer: ...".
 * @param {string} text - LLM response text
 * @returns {string|null} Answer text or null
 */
export function parseReActAnswer(text) {
  const match = text.match(/Answer:\s*([\s\S]*)/);
  return match ? match[1].trim() : null;
}

/**
 * Extract a ReAct thought: "Thought: ...".
 * @param {string} text - LLM response text
 * @returns {string|null} Thought text or null
 */
export function parseReActThought(text) {
  const match = text.match(/Thought:\s*(.+)/);
  return match ? match[1].trim() : null;
}

/**
 * Parse a ReWOO plan into structured steps.
 * Tries strict format first ("Plan: desc #E1 = tool[input]"),
 * then falls back to loose format ("#E1 = tool[input]").
 *
 * @param {string} text - Raw planner output
 * @returns {Array<{description: string, variable: string, tool: string, toolInput: string}>}
 */
export function parseReWOOPlan(text) {
  const steps = [];

  // Strict format: "Plan: <desc> #E<n> = <tool>[<input>]"
  const strictRegex = /Plan:\s*(.+?)\s*(#E\d+)\s*=\s*(\w+)\s*\[([^\]]+)\]/g;
  let match;
  while ((match = strictRegex.exec(text)) !== null) {
    steps.push({
      description: match[1].trim(),
      variable: match[2],
      tool: match[3],
      toolInput: match[4],
    });
  }
  if (steps.length > 0) return steps;

  // Loose fallback: "#E<n> = <tool>[<input>]" without requiring "Plan:" prefix
  const looseRegex = /(#E\d+)\s*=\s*(\w+)\s*\[([^\]]+)\]/g;
  while ((match = looseRegex.exec(text)) !== null) {
    const before = text.slice(0, match.index);
    const lastLine = before.split('\n').pop()?.trim() || '';
    const desc = lastLine.replace(/^(?:Plan:|Step\s*\d+[.):]*)\s*/i, '').trim() || 'Step';
    steps.push({
      description: desc,
      variable: match[1],
      tool: match[2],
      toolInput: match[3],
    });
  }
  return steps;
}

/**
 * Parse a numbered or bulleted plan into step strings.
 * Tries numbered format first ("1. step"), then bullets ("- step").
 * Returns empty array if no steps found (caller handles fallback).
 *
 * @param {string} text - Raw plan text
 * @returns {string[]} Array of step descriptions
 */
export function parsePlanSteps(text) {
  const lines = text.split('\n');
  const steps = [];

  // Primary: numbered list "1. step" or "1) step"
  for (const line of lines) {
    const match = line.match(/^\s*\d+[.)]\s*(.+)/);
    if (match) {
      steps.push(match[1].trim());
    }
  }
  if (steps.length > 0) return steps;

  // Secondary: bullet list "- step" or "* step"
  for (const line of lines) {
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)/);
    if (bulletMatch) {
      steps.push(bulletMatch[1].trim());
    }
  }

  // No dangerous fallback — return empty array, caller handles it
  return steps;
}

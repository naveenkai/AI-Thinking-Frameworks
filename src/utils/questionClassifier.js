/**
 * Question classifier — determines whether a question is factual or open-ended.
 *
 * Two-tier approach:
 * 1. **Heuristic** — instant regex-based classification for obvious cases (free)
 * 2. **LLM fallback** — one tiny API call for ambiguous cases
 *
 * Used by CoT to decide between majority-vote (factual) and synthesis (open-ended).
 *
 * @module questionClassifier
 */

// ── Tier 1: Instant heuristic (no LLM) ─────────────────────────

/**
 * Classify a question using regex heuristics only.
 * Returns null for ambiguous cases that need LLM classification.
 *
 * @param {string} question - The user's question
 * @returns {'factual' | 'open-ended' | null} Classification or null if ambiguous
 */
export function classifyQuestionHeuristic(question) {
  const q = question.toLowerCase().trim();

  // ── Obviously open-ended ─────────────────────────────────────

  // Imperative verbs at start
  if (/^(plan|design|create|write|draft|compose|build|develop|outline|suggest|recommend|describe|explain|compare|analyze|evaluate|propose|brainstorm|generate|list|organize|prepare|arrange|schedule|help|give|tell|show|make|provide)\b/.test(q)) {
    // But filter out factual-looking "give me the number of..." etc.
    if (/^(give|tell|show|provide)\b.*\b(number|count|name|date|year|capital|population|answer|result|value|price|cost of)\b/.test(q)) {
      return 'factual';
    }
    return 'open-ended';
  }

  // Contains planning/creative keywords anywhere
  const openKeywords = /\b(plan|itinerary|budget plan|trip plan|roadmap|strategy|strategies|guide|tutorial|advice|tips|ideas|suggestions|recommendations|ways to|steps to|how to|pros and cons|advantages|disadvantages|opportunities|checklist|schedule|agenda|recipe|workout|routine|curriculum|syllabus)\b/;
  if (openKeywords.test(q)) return 'open-ended';

  // How can/should/would patterns
  if (/\bhow (?:can|do|should|would|could|to)\b/.test(q)) return 'open-ended';

  // "What are the best/top/some" — asking for lists/opinions
  if (/\bwhat (?:are|would be) (?:the |some |)(?:best|top|good|great|popular|common|effective|important|key|main|major)\b/.test(q)) return 'open-ended';

  // Under/within budget
  if (/(?:under|within|on a|for a|in a)\s+(?:\w+\s+)?budget\b/.test(q)) return 'open-ended';

  // ── Obviously factual ───────────────────────────────────────

  // Direct factual questions
  if (/^(what is|what was|what's|who is|who was|who's|when did|when was|when is|where is|where was|where did)\b/.test(q)) return 'factual';

  // Quantity questions
  if (/^how (many|much|old|tall|long|far|fast|heavy|deep|wide)\b/.test(q)) return 'factual';

  // Math
  if (/\d+\s*[+\-*/^]\s*\d+/.test(q)) return 'factual';
  if (/^(calculate|compute|solve|find the value)\b/.test(q)) return 'factual';

  // True/false
  if (/^(true or false|is it true|did|does|is|was|are|were)\b/.test(q)) return 'factual';

  // ── Ambiguous — return null (needs LLM) ─────────────────────
  return null;
}

// ── Tier 2: LLM-based classification ────────────────────────────

/**
 * Classify a question using a tiny LLM call (10 max tokens).
 *
 * @param {string} question - The user's question
 * @param {object} options
 * @param {string} options.apiKey  - OpenAI API key
 * @param {string} options.model   - Model ID
 * @param {AbortSignal} [options.signal] - Abort signal
 * @returns {Promise<{type: 'factual'|'open-ended', usage: object}>}
 */
export async function classifyQuestionWithLLM(question, { apiKey, model, signal }) {
  // Dynamic import to avoid circular dependency
  const { callLLM } = await import('../frameworks/llm');

  const result = await callLLM(
    [{
      role: 'user',
      content: `Classify this question as either "factual" or "open-ended".

Factual = has ONE correct answer (a number, name, date, fact, yes/no)
Open-ended = creative, planning, opinions, lists of ideas, strategies, subjective, or can have many valid different answers

Question: "${question}"

Reply with ONLY one word: factual or open-ended`,
    }],
    { apiKey, model, temperature: 0, maxTokens: 10, signal }
  );

  const answer = result.content.trim().toLowerCase();
  return {
    type: answer.includes('open') ? 'open-ended' : 'factual',
    usage: result.usage,
  };
}

// ── Combined classifier ─────────────────────────────────────────

/**
 * Async classifier with LLM fallback. Use this for best accuracy.
 * Tries heuristic first (instant, free), falls back to LLM for ambiguous cases.
 */
export async function classifyQuestionSmart(question, { apiKey, model, signal } = {}) {
  const heuristic = classifyQuestionHeuristic(question);
  if (heuristic) return { type: heuristic, usage: null };

  // Ambiguous — ask the LLM
  if (apiKey) {
    try {
      return await classifyQuestionWithLLM(question, { apiKey, model, signal });
    } catch (err) {
      console.warn('LLM classification failed, defaulting to factual:', err.message);
      return { type: 'factual', usage: null };
    }
  }

  return { type: 'factual', usage: null };
}

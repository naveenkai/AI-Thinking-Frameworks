/**
 * Chain-of-Thought (CoT) with Self-Consistency.
 *
 * Pipeline:
 * 1. Few-shot or zero-shot CoT prompt
 * 2. Sample N reasoning paths at temperature > 0 (parallel)
 * 3. Classify question as factual or open-ended
 * 4a. Factual → extract answer from each path → smart majority vote
 * 4b. Open-ended → synthesize all paths into one comprehensive answer
 *
 * @module cot
 */

/**
 * @typedef {object} CoTResult
 * @property {string}  framework          - Always 'CoT'
 * @property {string}  questionType       - 'factual' | 'open-ended'
 * @property {string[]} paths             - All reasoning paths
 * @property {(string|null)[]} answers    - Extracted answers (null for open-ended)
 * @property {object}  [voteCounts]       - { answer → count } (factual only)
 * @property {string}  [synthesizedAnswer] - Merged answer (open-ended only)
 * @property {string}  finalAnswer        - Display answer
 * @property {string}  answer             - Same as finalAnswer (for uniform access)
 * @property {number|null} confidence     - vote.count / nSamples (null for open-ended)
 * @property {number}  extractionFailures - Paths where answer extraction failed
 * @property {object}  usage              - Aggregated token usage
 * @property {number}  llmCalls           - Total LLM API calls made
 * @property {number}  timeMs             - Wall-clock time in milliseconds
 */

import { callLLM } from './llm';
import { extractAnswer } from '../utils/parser';
import { sumUsage } from '../utils/tokenCounter';
import { classifyQuestionSmart } from '../utils/questionClassifier';

// ── Answer normalization helpers ─────────────────────────────────

function basicNormalize(raw) {
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/\.?\s*the answer is\b.*$/gi, '');
  s = s.replace(/^(the|a|an)\s+/i, '');
  s = s.replace(/^[\s.,;:!?"'()]+|[\s.,;:!?"'()]+$/g, '');
  s = s.replace(/\s+/g, ' ');
  return s.trim();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function areSimilar(a, b) {
  if (a === b) return true;
  if (a.length < 2 || b.length < 2) return false;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return new RegExp(`(?:^|\\b)${escapeRegex(shorter)}(?:\\b|$)`).test(longer);
}

/**
 * Use one cheap LLM call to canonicalize semantically equivalent answers.
 * Returns a map: original_lowercase -> canonical_form
 */
async function canonicalizeWithLLM(uniqueAnswers, { apiKey, model, signal }) {
  const prompt = `I have these answers to the same question from multiple reasoning paths. Group answers that mean the same thing (even if worded differently, or one is more detailed) and assign each the same short canonical form.

Answers:
${uniqueAnswers.map((a, i) => `${i + 1}. "${a}"`).join('\n')}

For EACH number, output its canonical form using EXACTLY this format (one per line):
1 -> canonical form
2 -> canonical form

Rules:
- If answers mean the same thing, give them the SAME canonical form
- Use the simplest, shortest correct form as canonical
- Preserve key details (e.g. "Belgrade, Serbia" and "Belgrade" are the same → use "Belgrade, Serbia")
- Do NOT add information not present in any answer`;

  const result = await callLLM(
    [{ role: 'user', content: prompt }],
    { apiKey, model, temperature: 0, maxTokens: 300, signal }
  );

  const mapping = {};
  for (const line of result.content.split('\n')) {
    const m = line.match(/(\d+)\s*->\s*(.+)/);
    if (m) {
      const idx = parseInt(m[1]) - 1;
      if (idx >= 0 && idx < uniqueAnswers.length) {
        mapping[uniqueAnswers[idx]] = m[2].trim().toLowerCase();
      }
    }
  }
  return { mapping, usage: result.usage };
}

/**
 * Smart majority vote: basic normalization + substring matching + optional LLM canonicalization.
 */
async function smartMajorityVote(answers, { apiKey, model, signal } = {}) {
  if (answers.length === 0) return { answer: null, count: 0, distribution: {}, extraUsage: null };

  const validAnswers = answers.filter(a => a !== null);
  if (validAnswers.length === 0) return { answer: null, count: 0, distribution: {}, extraUsage: null };

  // Step 1: Basic normalization
  const entries = validAnswers.map(a => ({
    original: String(a).trim().toLowerCase(),
    normalized: basicNormalize(a),
  }));

  // Step 2: Group by normalized form
  const normGroups = {};
  for (const { original, normalized } of entries) {
    const key = normalized || original;
    if (!normGroups[key]) normGroups[key] = { count: 0, originals: {} };
    normGroups[key].count++;
    normGroups[key].originals[original] = (normGroups[key].originals[original] || 0) + 1;
  }

  // Step 3: Merge groups via substring similarity
  const sortedKeys = Object.keys(normGroups).sort((a, b) => normGroups[b].count - normGroups[a].count);
  const merged = {};

  for (const key of sortedKeys) {
    let mergedInto = null;
    for (const canonical of Object.keys(merged)) {
      if (areSimilar(key, canonical)) {
        mergedInto = canonical;
        break;
      }
    }
    if (mergedInto) {
      merged[mergedInto].count += normGroups[key].count;
      for (const [orig, cnt] of Object.entries(normGroups[key].originals)) {
        merged[mergedInto].originals[orig] = (merged[mergedInto].originals[orig] || 0) + cnt;
      }
    } else {
      merged[key] = { count: normGroups[key].count, originals: { ...normGroups[key].originals } };
    }
  }

  // Step 4: If still multiple groups, try LLM canonicalization
  let extraUsage = null;
  const groupKeys = Object.keys(merged);

  if (groupKeys.length > 1 && apiKey) {
    try {
      const uniqueOriginals = [...new Set(entries.map(e => e.original))];
      const { mapping, usage } = await canonicalizeWithLLM(uniqueOriginals, { apiKey, model, signal });
      extraUsage = usage;

      // Rebuild groups using LLM canonical forms
      const llmGroups = {};
      for (const { original } of entries) {
        const canonical = mapping[original] || original;
        if (!llmGroups[canonical]) llmGroups[canonical] = { count: 0, originals: {} };
        llmGroups[canonical].count++;
        llmGroups[canonical].originals[original] = (llmGroups[canonical].originals[original] || 0) + 1;
      }

      // Use LLM groups instead
      return buildVoteResult(llmGroups, validAnswers.length, extraUsage);
    } catch (err) {
      console.warn('LLM canonicalization failed, using basic grouping:', err.message);
    }
  }

  return buildVoteResult(merged, validAnswers.length, extraUsage);
}

function buildVoteResult(groups, totalAnswers, extraUsage) {
  let bestKey = null;
  let bestCount = 0;
  const distribution = {};

  for (const [, group] of Object.entries(groups)) {
    // Pick the most frequent original form as display label
    let displayKey = null;
    let maxOrigCount = 0;
    for (const [orig, cnt] of Object.entries(group.originals)) {
      if (cnt > maxOrigCount) {
        maxOrigCount = cnt;
        displayKey = orig;
      }
    }
    distribution[displayKey] = group.count;

    if (group.count > bestCount) {
      bestCount = group.count;
      bestKey = displayKey;
    }
  }

  return { answer: bestKey, count: bestCount, distribution, extraUsage };
}

/**
 * For open-ended questions: synthesize all reasoning paths into one comprehensive answer.
 * Takes the best ideas from each path and merges them.
 */
async function synthesizePaths(question, paths, { apiKey, model, signal }) {
  const pathSummaries = paths
    .map((p, i) => `--- Path ${i + 1} ---\n${p}`)
    .join('\n\n');

  const prompt = `You were asked this question: "${question}"

Multiple reasoning paths explored different angles. Here they are:

${pathSummaries}

Now synthesize the BEST comprehensive answer by:
1. Identifying the strongest ideas and insights across all paths
2. Noting where multiple paths agree (higher confidence points)
3. Combining complementary ideas into one cohesive response
4. Dropping weak, redundant, or contradictory points

Write ONE clear, well-structured final answer using markdown formatting (headings, bold, lists, tables as appropriate). Do not reference the individual paths — just give the best synthesized answer.`;

  const result = await callLLM(
    [{ role: 'user', content: prompt }],
    { apiKey, model, temperature: 0, maxTokens: 1500, signal }
  );

  return { answer: result.content, usage: result.usage };
}

const FEW_SHOT_EXEMPLARS = `Q: Roger has 5 tennis balls. He buys 2 more cans of tennis balls. Each can has 3 tennis balls. How many tennis balls does he have now?
A: Roger started with 5 balls. 2 cans of 3 tennis balls each is 2 * 3 = 6 tennis balls. 5 + 6 = 11. The answer is 11.

Q: The cafeteria had 23 apples. If they used 20 to make lunch and bought 6 more, how many apples do they have?
A: The cafeteria had 23 apples originally. They used 20 to make lunch. So they had 23 - 20 = 3. They bought 6 more apples, so they have 3 + 6 = 9. The answer is 9.

Q: Shawn has five toys. For Christmas, he got two toys each from his mom and dad. How many toys does he have now?
A: Shawn started with 5 toys. He got 2 from mom and 2 from dad, that is 2 + 2 = 4 more toys. 5 + 4 = 9. The answer is 9.

Q: There were nine computers in the server room. Five more computers were installed each day, from monday to thursday. How many computers are now in the server room?
A: There are 4 days from monday to thursday. 5 computers were added each day, so 5 * 4 = 20 computers were added. 9 + 20 = 29. The answer is 29.`;

function buildPrompt(question, mode = 'few-shot') {
  if (mode === 'zero-shot') {
    return `Q: ${question}\nA: Let's think step by step.`;
  }
  return `${FEW_SHOT_EXEMPLARS}\n\nQ: ${question}\nA: Let's think step by step.`;
}

/**
 * Run CoT with Self-Consistency.
 * @param {string} question
 * @param {object} options
 * @param {function} onProgress - callback(index, path) called as each path completes
 * @returns {Promise<object>} { paths, answers, voteCounts, finalAnswer, confidence, extractionFailures, usage, timeMs }
 */
export async function runCoT(question, { apiKey, model = 'gpt-4o-mini', nSamples = 5, temperature = 0.7, mode = 'few-shot', signal } = {}, onProgress) {
  const startTime = Date.now();
  const prompt = buildPrompt(question, mode);

  const messages = [
    { role: 'system', content: 'You are a helpful assistant that solves problems step by step. Always end your reasoning with "The answer is <your answer>."' },
    { role: 'user', content: prompt },
  ];

  // Fire all N samples in parallel
  const promises = Array.from({ length: nSamples }, (_, i) =>
    callLLM(messages, { apiKey, model, temperature, maxTokens: 512, signal }).then((result) => {
      if (onProgress) onProgress(i, result.content);
      return result;
    })
  );

  const results = await Promise.all(promises);

  const paths = results.map((r) => r.content);
  const usages = results.map((r) => r.usage);

  // Classify question type (heuristic + LLM fallback)
  const classification = await classifyQuestionSmart(question, { apiKey, model, signal });
  if (classification.usage) usages.push(classification.usage);
  const questionType = classification.type;

  if (questionType === 'open-ended') {
    // ── OPEN-ENDED: Synthesize all paths into one best answer ──
    const synthesis = await synthesizePaths(question, paths, { apiKey, model, signal });
    usages.push(synthesis.usage);

    return {
      framework: 'CoT',
      questionType: 'open-ended',
      paths,
      answers: paths.map(() => null), // no extraction needed
      synthesizedAnswer: synthesis.answer,
      finalAnswer: synthesis.answer,
      answer: synthesis.answer,
      confidence: null,
      extractionFailures: 0,
      usage: sumUsage(usages),
      llmCalls: nSamples + 1 + (classification.usage ? 1 : 0),
      timeMs: Date.now() - startTime,
    };
  }

  // ── FACTUAL: Majority vote with smart grouping ──
  const answers = paths.map((p) => extractAnswer(p));
  const extractionFailures = answers.filter((a) => a === null).length;
  const vote = await smartMajorityVote(answers, { apiKey, model, signal });

  if (vote.extraUsage) {
    usages.push(vote.extraUsage);
  }

  const validCount = answers.filter((a) => a !== null).length;
  const finalAnswer = validCount > 0
    ? vote.answer
    : '[Extraction failed — see reasoning paths]';

  return {
    framework: 'CoT',
    questionType: 'factual',
    paths,
    answers,
    voteCounts: vote.distribution,
    finalAnswer,
    answer: finalAnswer,
    confidence: validCount > 0 ? vote.count / nSamples : 0,
    extractionFailures,
    usage: sumUsage(usages),
    llmCalls: nSamples + (vote.extraUsage ? 1 : 0) + (classification.usage ? 1 : 0),
    timeMs: Date.now() - startTime,
  };
}

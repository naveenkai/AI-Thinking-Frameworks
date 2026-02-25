/**
 * ReWOO (Reasoning Without Observation) Framework.
 *
 * 3-phase pipeline with minimal LLM calls:
 * 1. **Planner** — 1 LLM call → full plan with #E variables
 * 2. **Worker**  — execute all tools mechanically (no LLM needed)
 * 3. **Solver**  — 1 LLM call with all evidence → final answer
 *
 * Total: exactly 2 LLM calls (+ any LLM tool calls in the plan).
 *
 * @module rewoo
 */

/**
 * @typedef {object} ReWOOResult
 * @property {string}  framework - Always 'ReWOO'
 * @property {string}  planText  - Raw planner output
 * @property {Array<{description: string, variable: string, tool: string, toolInput: string}>} steps
 * @property {object}  evidence  - { '#E1': result, '#E2': result, ... }
 * @property {string}  answer    - Final answer from solver
 * @property {object}  usage     - Aggregated token usage
 * @property {number}  llmCalls  - Total LLM API calls (2 + LLM tool calls)
 * @property {number}  timeMs    - Wall-clock time in milliseconds
 */

import { callLLM } from './llm';
import { executeTool } from './tools';
import { parseReWOOPlan } from '../utils/parser';
import { sumUsage } from '../utils/tokenCounter';

function buildPlannerPrompt(task) {
  return `For the following task, make plans that can solve the problem step by step. For each plan, indicate which external tool together with tool input to retrieve evidence. You can store the evidence into a variable #E that can be called by later tools. (Plan, #E1, Plan, #E2, Plan, ...)

Tools can be one of the following:
(1) wikipedia[input]: Search Wikipedia for information. Useful for finding facts about people, places, events, etc.
(2) search[input]: Search the web for information. Useful for finding current or specific information.
(3) calculate[input]: Evaluate a math expression. Input should be a numeric expression like "2 * 3 + 4".
(4) current_datetime[] or datetime[]: Get the current date and time (UTC and local). No input required.
(5) LLM[input]: A language model like yourself. Useful when you need to reason with general knowledge. Input can be any instruction.

For example,
Task: What is the population of the capital of France?
Plan: Search for the capital of France. #E1 = wikipedia[capital of France]
Plan: Find the population of the capital found. #E2 = search[population of #E1]
Plan: State the final answer. #E3 = LLM[Based on #E1 and #E2, what is the population of the capital of France?]

Begin! Describe your plans with rich details. Each Plan should be followed by only one #E.

Task: ${task}`;
}

function buildSolverPrompt(task, planWithEvidence) {
  return `Solve the following task or problem. To solve the problem, we have made step-by-step Plan and retrieved corresponding Evidence to each Plan. Use them with caution since long evidence might contain irrelevant information.

${planWithEvidence}

Now solve the question or task according to provided Evidence above. Respond with the answer directly with no extra words.

Task: ${task}
Response:`;
}

/**
 * Run ReWOO agent.
 * @param {string} question
 * @param {object} options
 * @param {function} onStep - callback({ phase, data })
 * @returns {Promise<object>}
 */
export async function runReWOO(question, { apiKey, model = 'gpt-4o-mini', signal } = {}, onStep) {
  const startTime = Date.now();
  const usages = [];

  // ── PHASE 1: PLANNER ─────────────────────────────────
  const plannerPrompt = buildPlannerPrompt(question);
  const planResult = await callLLM(
    [{ role: 'user', content: plannerPrompt }],
    { apiKey, model, temperature: 0, maxTokens: 1024, signal }
  );
  usages.push(planResult.usage);

  const planText = planResult.content;
  const steps = parseReWOOPlan(planText);

  if (onStep) onStep({ phase: 'plan', data: { planText, steps } });

  // ── PHASE 2: WORKER ──────────────────────────────────
  const evidence = {};

  for (const step of steps) {
    // Substitute #E variables in tool input (use replaceAll for safety)
    let input = step.toolInput;
    for (const [varName, value] of Object.entries(evidence)) {
      input = input.replaceAll(varName, String(value));
    }

    let result;
    let isError = false;

    if (step.tool.toLowerCase() === 'llm') {
      const llmResult = await callLLM(
        [{ role: 'user', content: input }],
        { apiKey, model, temperature: 0, maxTokens: 512, signal }
      );
      usages.push(llmResult.usage);
      result = llmResult.content;
    } else {
      result = await executeTool(step.tool, input, apiKey);
      isError = typeof result === 'string' && result.startsWith('Error:');
    }

    evidence[step.variable] = isError ? `[FAILED: ${result}]` : result;
    if (onStep) onStep({ phase: 'evidence', data: { variable: step.variable, input, result, isError } });
  }

  // ── PHASE 3: SOLVER ──────────────────────────────────
  let planWithEvidence = '';
  for (const step of steps) {
    let input = step.toolInput;
    for (const [varName, value] of Object.entries(evidence)) {
      input = input.replaceAll(varName, String(value));
    }
    planWithEvidence += `Plan: ${step.description}\n${step.variable} = ${step.tool}[${input}]\nEvidence: ${evidence[step.variable] || 'N/A'}\n\n`;
  }

  const solverPrompt = buildSolverPrompt(question, planWithEvidence);
  const solverResult = await callLLM(
    [{ role: 'user', content: solverPrompt }],
    { apiKey, model, temperature: 0, maxTokens: 512, signal }
  );
  usages.push(solverResult.usage);

  const answer = solverResult.content.trim();
  if (onStep) onStep({ phase: 'solve', data: { answer } });

  const llmToolCalls = steps.filter((s) => s.tool.toLowerCase() === 'llm').length;

  return {
    framework: 'ReWOO',
    planText,
    steps,
    evidence,
    answer,
    usage: sumUsage(usages),
    llmCalls: 2 + llmToolCalls,
    timeMs: Date.now() - startTime,
  };
}

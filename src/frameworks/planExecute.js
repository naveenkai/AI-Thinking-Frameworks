/**
 * Plan-and-Execute Framework.
 *
 * Adaptive planning loop:
 * 1. **Planner** — generate a step-by-step plan (1 LLM call)
 * 2. **Executor** — execute each step via a mini ReAct loop (LLM + tools)
 * 3. **Replanner** — after each step, decide if done or update the plan
 *
 * Supports up to 20 replan cycles and 8 executor turns per step.
 *
 * @module planExecute
 */

/**
 * @typedef {object} PlanExecuteResult
 * @property {string}  framework - Always 'Plan-Execute'
 * @property {string}  planText  - Raw initial plan from planner
 * @property {Array<[string, string]>} pastSteps - Completed [step, result] pairs
 * @property {number}  replans   - Number of times the plan was revised
 * @property {string}  answer    - Final answer (null if no answer produced)
 * @property {string}  [error]   - Error message if plan didn't converge
 * @property {object}  usage     - Aggregated token usage
 * @property {number}  llmCalls  - Total LLM API calls
 * @property {number}  timeMs    - Wall-clock time in milliseconds
 */

import { callLLM } from './llm';
import { executeTool, getToolDescriptions } from './tools';
import { parsePlanSteps, parseReActAction, parseReActAnswer } from '../utils/parser';
import { sumUsage } from '../utils/tokenCounter';

const PLANNER_SYSTEM = `You are a planning agent. Given an objective, create a simple step-by-step plan.
This plan should involve individual tasks that, if executed correctly, will yield the correct answer.
Do not add superfluous steps. The result of the final step should be the final answer.
Make sure each step has all the information needed. Do not skip steps.

Output a numbered list of steps, one per line. Example:
1. Search for X
2. Calculate Y based on the result
3. Provide the final answer`;

/** Lazy-initialized executor system prompt (avoids calling getToolDescriptions at module load). */
let _executorSystem = null;
function getExecutorSystem() {
  if (!_executorSystem) {
    _executorSystem = `You are an execution agent. You execute a single step of a plan using available tools.

Your available tools are:
${getToolDescriptions()}

To use a tool, respond with:
Thought: <your reasoning>
Action: <tool_name>: <tool_input>
PAUSE

When you have the result for this step, respond with:
Answer: <result of this step>

Only execute the specific step you are given. Be concise.`;
  }
  return _executorSystem;
}

function buildReplannerPrompt(objective, plan, pastSteps) {
  const stepsStr = pastSteps.map(([step, result]) => `Step: ${step}\nResult: ${result}`).join('\n\n');
  return `Your objective was:
${objective}

Your original plan was:
${plan.map((s, i) => `${i + 1}. ${s}`).join('\n')}

You have completed these steps:
${stepsStr}

Based on the results so far, decide:
- If the objective is fully achieved, respond with: DONE: <final answer>
- If more steps are needed, respond with an updated numbered plan (only remaining steps).

Do not repeat completed steps. Be concise.`;
}

/**
 * Execute a single step (mini ReAct loop with up to 8 turns).
 */
async function executeStep(stepText, fullPlan, { apiKey, model, signal }) {
  const messages = [
    { role: 'system', content: getExecutorSystem() },
    { role: 'user', content: `For the following plan:\n${fullPlan}\n\nExecute this step: ${stepText}` },
  ];
  const usages = [];

  for (let turn = 0; turn < 8; turn++) {
    const result = await callLLM(messages, { apiKey, model, temperature: 0, maxTokens: 512, signal });
    usages.push(result.usage);
    const response = result.content;

    const answer = parseReActAnswer(response);
    if (answer) return { result: answer, usages };

    const action = parseReActAction(response);
    if (action) {
      const observation = await executeTool(action.actionName, action.actionInput, apiKey);
      messages.push({ role: 'assistant', content: response });
      messages.push({ role: 'user', content: `Observation: ${observation}` });
    } else {
      // No action or answer, return the raw response as the result
      return { result: response, usages };
    }
  }

  // Step execution exceeded max turns — return structured error
  return { result: null, error: 'Step execution exceeded max turns.', usages };
}

/**
 * Run Plan-and-Execute agent.
 * @param {string} question
 * @param {object} options
 * @param {function} onStep - callback({ phase, data })
 * @returns {Promise<object>}
 */
export async function runPlanExecute(question, { apiKey, model = 'gpt-4o-mini', maxReplans = 20, signal } = {}, onStep) {
  const startTime = Date.now();
  const usages = [];
  let llmCalls = 0;

  // ── PHASE 1: PLAN ────────────────────────────────────
  const planResult = await callLLM(
    [
      { role: 'system', content: PLANNER_SYSTEM },
      { role: 'user', content: question },
    ],
    { apiKey, model, temperature: 0, maxTokens: 512, signal }
  );
  usages.push(planResult.usage);
  llmCalls++;

  let plan = parsePlanSteps(planResult.content);
  const planText = planResult.content;

  // Handle empty plan: treat entire planner text as single step
  if (plan.length === 0) {
    plan = [planResult.content.trim()];
  }

  if (onStep) onStep({ phase: 'plan', data: { planText, steps: plan } });

  // ── PHASE 2+3: EXECUTE + REPLAN LOOP ─────────────────
  const pastSteps = [];
  let replanCount = 0;
  let finalAnswer = null;

  while (plan.length > 0 && replanCount <= maxReplans) {
    const currentStep = plan.shift();

    if (onStep) onStep({ phase: 'execute-start', data: { step: currentStep, stepIndex: pastSteps.length } });

    const fullPlanStr = plan.map((s, i) => `${i + 1}. ${s}`).join('\n');
    const execResult = await executeStep(currentStep, fullPlanStr, { apiKey, model, signal });
    usages.push(...execResult.usages);
    llmCalls += execResult.usages.length;

    // Handle step errors vs results
    const stepOutput = execResult.error
      ? `[Error: ${execResult.error}]`
      : execResult.result;

    pastSteps.push([currentStep, stepOutput]);
    if (onStep) onStep({ phase: 'execute-done', data: { step: currentStep, result: stepOutput } });

    // ── REPLAN ──────────────────────────────────────────
    const originalPlan = parsePlanSteps(planText);
    const replanPrompt = buildReplannerPrompt(question, originalPlan.length > 0 ? originalPlan : [planText.trim()], pastSteps);
    const replanResult = await callLLM(
      [
        { role: 'system', content: 'You are a replanning agent. Evaluate progress and decide if the task is complete or needs more steps.' },
        { role: 'user', content: replanPrompt },
      ],
      { apiKey, model, temperature: 0, maxTokens: 512, signal }
    );
    usages.push(replanResult.usage);
    llmCalls++;

    const replanResponse = replanResult.content;

    // Check if done
    const doneMatch = replanResponse.match(/DONE:\s*([\s\S]*)/);
    if (doneMatch) {
      finalAnswer = doneMatch[1].trim();
      if (onStep) onStep({ phase: 'done', data: { answer: finalAnswer } });
      break;
    }

    // Update plan
    const newSteps = parsePlanSteps(replanResponse);
    if (newSteps.length > 0) {
      plan = newSteps;
      replanCount++;
      if (onStep) onStep({ phase: 'replan', data: { newPlan: plan, replanCount } });
    } else {
      // Can't parse new plan, check if last step had a real result
      const lastResult = pastSteps[pastSteps.length - 1]?.[1];
      finalAnswer = (lastResult && !lastResult.startsWith('[Error:'))
        ? lastResult
        : null;
      if (onStep) onStep({ phase: 'done', data: { answer: finalAnswer } });
      break;
    }
  }

  // Fallback: try to get answer from last successful step result
  if (!finalAnswer) {
    for (let i = pastSteps.length - 1; i >= 0; i--) {
      const result = pastSteps[i][1];
      if (result && !result.startsWith('[Error:')) {
        finalAnswer = result;
        break;
      }
    }
  }

  return {
    framework: 'Plan-Execute',
    planText,
    pastSteps,
    replans: replanCount,
    answer: finalAnswer,
    error: finalAnswer ? undefined : 'Plan-Execute did not produce a final answer within the allowed steps.',
    usage: sumUsage(usages),
    llmCalls,
    timeMs: Date.now() - startTime,
  };
}

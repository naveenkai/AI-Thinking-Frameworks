/**
 * ReAct (Reasoning + Acting) Framework.
 *
 * Implements the Thought → Action → Observation loop:
 * 1. LLM outputs a Thought (reasoning) and an Action (tool call)
 * 2. Tool is executed, producing an Observation
 * 3. Observation is fed back to the LLM
 * 4. Repeats until "Answer:" is emitted or max turns exceeded
 *
 * @module react
 */

/**
 * @typedef {object} ReActResult
 * @property {string}  framework   - Always 'ReAct'
 * @property {string}  answer      - Final answer (null if max turns exceeded)
 * @property {Array<{role: string, content: string, turn: number}>} trajectory - Full interaction log
 * @property {number}  turns       - Number of LLM turns taken
 * @property {object}  usage       - Aggregated token usage
 * @property {number}  llmCalls    - Total LLM API calls
 * @property {number}  timeMs      - Wall-clock time in milliseconds
 * @property {string}  [error]     - Error message if max turns exceeded
 * @property {boolean} [truncated] - True if max turns was hit
 */

import { callLLM } from './llm';
import { executeTool, getToolDescriptions } from './tools';
import { parseReActAction, parseReActAnswer } from '../utils/parser';
import { sumUsage } from '../utils/tokenCounter';

function buildSystemPrompt() {
  return `You run in a loop of Thought, Action, PAUSE, Observation.
At the end of the loop you output an Answer.

Use Thought to describe your reasoning about the question.
Use Action to run one of the available tools - then return PAUSE.
Observation will be the result of running that action.

Your available tools are:

${getToolDescriptions()}

To use a tool, respond with EXACTLY this format:

Thought: <your reasoning about what to do next>
Action: <tool_name>: <tool_input>
PAUSE

You will be called again with:
Observation: <result of the action>

When you have enough information to answer, respond with:

Thought: <your final reasoning>
Answer: <your final answer>

Important rules:
- Always start with a Thought before taking an Action.
- Only use ONE Action per turn.
- After Action, write PAUSE and stop.
- If an action returns an error, reason about it and try differently.
- Do not make up information. Use tools to find facts.`;
}

/**
 * Run the ReAct agent loop.
 * @param {string} question
 * @param {object} options
 * @param {function} onStep - callback({ type, content }) for each step
 * @returns {Promise<object>} { answer, trajectory, turns, usage, llmCalls, timeMs }
 */
export async function runReAct(question, { apiKey, model = 'gpt-4o-mini', maxTurns = 50, signal } = {}, onStep) {
  const startTime = Date.now();
  const systemPrompt = buildSystemPrompt();
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question },
  ];
  const trajectory = [];
  const usages = [];
  let turn = 0;

  while (turn < maxTurns) {
    turn++;

    const result = await callLLM(messages, { apiKey, model, temperature: 0, maxTokens: 1024, signal });
    usages.push(result.usage);
    const response = result.content;

    trajectory.push({ role: 'assistant', content: response, turn });
    if (onStep) onStep({ type: 'llm', content: response, turn });

    // Check for final answer
    const answer = parseReActAnswer(response);
    if (answer) {
      return {
        framework: 'ReAct',
        answer,
        trajectory,
        turns: turn,
        usage: sumUsage(usages),
        llmCalls: turn,
        timeMs: Date.now() - startTime,
      };
    }

    // Check for action
    const action = parseReActAction(response);
    if (action) {
      if (onStep) onStep({ type: 'action', content: `${action.actionName}: ${action.actionInput}`, turn });

      const observation = await executeTool(action.actionName, action.actionInput, apiKey);

      trajectory.push({ role: 'observation', content: observation, turn });
      if (onStep) onStep({ type: 'observation', content: observation, turn });

      messages.push({ role: 'assistant', content: response });
      messages.push({ role: 'user', content: `Observation: ${observation}` });
    } else {
      // No action and no answer — treat as confused, nudge it
      messages.push({ role: 'assistant', content: response });
      messages.push({
        role: 'user',
        content: 'Please respond with either:\nThought: <reasoning>\nAction: <tool>: <input>\nPAUSE\n\nOr:\nAnswer: <final answer>',
      });
    }
  }

  // Max turns exceeded — try to extract partial answer from last response
  const lastContent = trajectory[trajectory.length - 1]?.content || '';
  const partialAnswer = parseReActAnswer(lastContent);

  return {
    framework: 'ReAct',
    answer: partialAnswer || null,
    error: `Exceeded maximum turns (${maxTurns}). The agent did not converge on a final answer.`,
    truncated: true,
    trajectory,
    turns: turn,
    usage: sumUsage(usages),
    llmCalls: turn,
    timeMs: Date.now() - startTime,
  };
}

/**
 * Shared constants used across the application.
 * Centralizes magic strings, configuration defaults, and static data
 * to avoid scattering them across multiple files.
 */

/** Valid framework identifiers — used for selection persistence and routing. */
export const FRAMEWORK_IDS = ['cot', 'react', 'rewoo', 'plan-execute'];

/** Framework display metadata for UI pills and headers. */
export const FRAMEWORKS = [
  { id: 'cot', label: 'CoT', fullName: 'Chain-of-Thought', badge: 'Chain-of-Thought' },
  { id: 'react', label: 'ReAct', fullName: 'ReAct', badge: 'Reason + Act' },
  { id: 'rewoo', label: 'ReWOO', fullName: 'ReWOO', badge: 'No Observation' },
  { id: 'plan-execute', label: 'Plan-Exec', fullName: 'Plan-Execute', badge: 'Plan + Replan' },
];

/** localStorage / sessionStorage keys. */
export const STORAGE_KEYS = {
  frameworks: 'tf-frameworks',
  apiKey: 'tf-api-key',
  runHistory: 'tf-run-history',
};

/** Maximum number of runs persisted in history. */
export const RUN_HISTORY_MAX = 5;

/** Sample questions shown in the empty state. */
export const SAMPLE_QUESTIONS = [
  "What is the hometown of the reigning men's Australian Open champion?",
  'How many tennis balls does Roger have if he starts with 5 and buys 2 cans of 3?',
  'What is the population of the capital of France?',
  'Who painted the Mona Lisa and in what year was it completed?',
];

/**
 * Approximate USD per 1M tokens (input, output) for cost estimates.
 * Used in the comparison table when "Show cost estimate" is enabled.
 */
export const MODEL_PRICING = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
};

/**
 * Token counting and usage aggregation utilities.
 * @module tokenCounter
 */

/**
 * Rough token estimate based on character count (~4 chars per token for English).
 * Used only for UI display — actual billing uses API-reported usage.
 *
 * @param {string} text - Text to estimate tokens for
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Sum an array of OpenAI usage objects into a single aggregate.
 *
 * @param {Array<{prompt_tokens?: number, completion_tokens?: number, total_tokens?: number}>} usageArray
 * @returns {{ prompt_tokens: number, completion_tokens: number, total_tokens: number }}
 */
export function sumUsage(usageArray) {
  return usageArray.reduce(
    (acc, u) => ({
      prompt_tokens: acc.prompt_tokens + (u.prompt_tokens || 0),
      completion_tokens: acc.completion_tokens + (u.completion_tokens || 0),
      total_tokens: acc.total_tokens + (u.total_tokens || 0),
    }),
    { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  );
}

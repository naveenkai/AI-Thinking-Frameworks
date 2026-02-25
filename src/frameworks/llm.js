/**
 * Shared LLM API wrapper — OpenAI-compatible chat completions.
 *
 * Features:
 * - Exponential backoff retry (3 attempts) for 429/5xx errors
 * - AbortController signal support for cancellation
 * - Warns on truncated responses (finish_reason=length)
 *
 * @module llm
 */

/**
 * @typedef {object} LLMResult
 * @property {string} content       - The LLM response text
 * @property {string} finishReason  - 'stop', 'length', etc.
 * @property {object} usage
 * @property {number} usage.prompt_tokens
 * @property {number} usage.completion_tokens
 * @property {number} usage.total_tokens
 */

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Call the OpenAI Chat Completions API with retry and abort support.
 *
 * @param {Array<{role: string, content: string}>} messages - Chat messages
 * @param {object}  options
 * @param {string}  options.apiKey      - OpenAI API key
 * @param {string}  [options.model]     - Model ID (default: 'gpt-4o-mini')
 * @param {number}  [options.temperature] - Sampling temperature (default: 0)
 * @param {number}  [options.maxTokens] - Max tokens to generate (default: 1024)
 * @param {AbortSignal} [options.signal] - AbortController signal for cancellation
 * @returns {Promise<LLMResult>}
 * @throws {Error} On non-retryable API errors or max retries exceeded
 * @throws {DOMException} AbortError if signal is aborted
 */
export async function callLLM(messages, { apiKey, model = 'gpt-4o-mini', temperature = 0, maxTokens = 1024, signal } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Check abort before each attempt
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    // Exponential backoff on retries
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, delay);
        if (signal) {
          const onAbort = () => { clearTimeout(timer); resolve(); };
          signal.addEventListener('abort', onAbort, { once: true });
        }
      });
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
    }

    let response;
    try {
      response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey,
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal,
      });
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') throw fetchErr;
      lastError = fetchErr;
      if (attempt < MAX_RETRIES) continue;
      throw lastError;
    }

    if (response.ok) {
      const data = await response.json();
      const choice = data.choices?.[0];
      if (!choice?.message) {
        throw new Error('No completion returned from API');
      }

      if (choice.finish_reason === 'length') {
        console.warn(`LLM response truncated (finish_reason=length) for model ${model}`);
      }

      return {
        content: choice.message.content,
        finishReason: choice.finish_reason,
        usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
    }

    if (!RETRYABLE_STATUSES.has(response.status)) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `LLM API error: ${response.status}`);
    }

    lastError = new Error(`LLM API error: ${response.status} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
    if (attempt < MAX_RETRIES) {
      console.warn(`LLM call failed (${response.status}), retrying in ${BASE_DELAY_MS * Math.pow(2, attempt)}ms...`);
    }
  }

  throw lastError;
}

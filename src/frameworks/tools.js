/**
 * Tool registry — shared tool definitions for all reasoning frameworks.
 *
 * Each tool exposes `{ name, description, execute(input, apiKey?) → Promise<string> }`.
 * Tools are stateless and always return a string result (errors are
 * returned as "Error: …" strings, not thrown).
 *
 * Available tools:
 * - **wikipedia** — Entity search + article summary (free, no API key)
 * - **search / websearch** — OpenAI web search via gpt-4o-mini-search-preview
 * - **calculate** — Safe math expression evaluation
 * - **current_datetime / datetime** — Current date/time in UTC and local
 *
 * @module tools
 */

// ── Wikipedia (free, good for factual entity lookups) ───────────

/**
 * Search Wikipedia for information with article summaries.
 * @param {string} query - Search query
 * @returns {Promise<string>} Summary + search snippets, or error message
 */
async function wikipedia(query) {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=3`;
  const res = await fetch(searchUrl);
  const data = await res.json();
  const results = data.query?.search || [];
  if (results.length === 0) return 'No Wikipedia results found.';

  const snippets = results
    .map((r) => r.snippet.replace(/<[^>]*>/g, ''))
    .join('\n\n');

  const topTitle = results[0].title;
  try {
    const summaryUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(topTitle)}&prop=extracts&exintro=1&explaintext=1&format=json&origin=*`;
    const sumRes = await fetch(summaryUrl);
    const sumData = await sumRes.json();
    const pages = sumData.query?.pages || {};
    const page = Object.values(pages)[0];
    const extract = page?.extract;
    if (extract && extract.length > 20) {
      return `Summary of "${topTitle}":\n${extract.slice(0, 800)}\n\n---\nSearch snippets:\n${snippets}`;
    }
  } catch (err) {
    console.warn('Wikipedia summary fetch failed:', err.message);
  }

  return snippets;
}

// ── OpenAI Web Search (uses gpt-4o-mini-search-preview model) ───

/**
 * Search the web using OpenAI's search-preview model.
 * Falls back to Wikipedia if apiKey is missing or the API call fails.
 * @param {string} query  - Search query
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<string>} Search results or Wikipedia fallback
 */
async function openaiWebSearch(query, apiKey) {
  if (!apiKey) {
    console.warn('openaiWebSearch called without apiKey, falling back to Wikipedia');
    return wikipedia(query);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-search-preview',
        messages: [
          { role: 'user', content: query },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.warn(`OpenAI web search failed (${response.status}):`, err.error?.message || 'Unknown error');
      // Fall back to Wikipedia on error
      return wikipedia(query);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return wikipedia(query);
    }

    return content;
  } catch (err) {
    console.warn('OpenAI web search failed:', err.message);
    return wikipedia(query);
  }
}

// ── Calculator ──────────────────────────────────────────────────

/**
 * Safely evaluate a math expression. Only allows numbers and basic operators.
 * @param {string} expression - Math expression (e.g. "4 * 7 / 3")
 * @returns {string} Numeric result or error message
 */
function calculate(expression) {
  const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
  if (sanitized !== expression.trim()) {
    return `Error: expression contains disallowed characters. Only numbers and +-*/().% are allowed.`;
  }
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${sanitized})`)();
    return String(result);
  } catch (e) {
    return `Calculation error: ${e.message}`;
  }
}

// ── Date/Time ───────────────────────────────────────────────────

/** Get the current date and time in both UTC and local formats. */
function currentDatetime() {
  const now = new Date();
  const iso = now.toISOString();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const day = dayNames[now.getDay()];
  return `Current date and time (UTC): ${iso}. Day of week: ${day}. Local date: ${now.toLocaleDateString()}; local time: ${now.toLocaleTimeString()}.`;
}

// ── Tool Registry ───────────────────────────────────────────────

export const toolRegistry = {
  wikipedia: {
    name: 'wikipedia',
    description: 'Search Wikipedia for information with article summaries. Input: a search query string.',
    execute: async (input) => wikipedia(input),
  },
  search: {
    name: 'search',
    description: 'Search the web for current, real-world information. Returns comprehensive results from across the internet. Input: a search query string.',
    execute: async (input, apiKey) => openaiWebSearch(input, apiKey),
  },
  websearch: {
    name: 'websearch',
    description: 'Search the web for current, real-world information. Returns comprehensive results from across the internet. Input: a search query string.',
    execute: async (input, apiKey) => openaiWebSearch(input, apiKey),
  },
  calculate: {
    name: 'calculate',
    description: 'Evaluate a math expression. Input: a math expression like "4 * 7 / 3". Only numbers and basic operators allowed.',
    execute: async (input) => calculate(input),
  },
  current_datetime: {
    name: 'current_datetime',
    description: 'Get the current date and time (UTC and local). Input: ignored (no input required).',
    execute: async () => currentDatetime(),
  },
  datetime: {
    name: 'datetime',
    description: 'Get the current date and time (UTC and local). Input: ignored (no input required).',
    execute: async () => currentDatetime(),
  },
};

/**
 * Get formatted tool descriptions for inclusion in system prompts.
 * Deduplicates aliases (e.g. search/websearch share the same description).
 * @returns {string} Newline-separated "name: description" list
 */
export function getToolDescriptions() {
  // Only show unique tools (skip aliases)
  const seen = new Set();
  return Object.values(toolRegistry)
    .filter((t) => {
      if (seen.has(t.description)) return false;
      seen.add(t.description);
      return true;
    })
    .map((t) => `${t.name}: ${t.description}`)
    .join('\n');
}

/**
 * Execute a tool by name with the given input.
 * @param {string} name   - Tool name (case-insensitive)
 * @param {string} input  - Tool input string
 * @param {string} [apiKey] - OpenAI API key (required for web search)
 * @returns {Promise<string>} Tool output or error message
 */
export function executeTool(name, input, apiKey) {
  const tool = toolRegistry[name.toLowerCase()];
  if (!tool) {
    return Promise.resolve(`Error: Unknown tool "${name}". Available tools: ${Object.keys(toolRegistry).join(', ')}`);
  }
  return tool.execute(input, apiKey);
}

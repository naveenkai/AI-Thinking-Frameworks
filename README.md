# Agent Thinking Frameworks

Compare how different reasoning frameworks (Chain-of-Thought, ReAct, ReWOO, Plan-Execute) answer the same question side by side. Pick a question, choose one or more frameworks, and run them with your own API key to see reasoning traces and final answers in one place.

## What it does

- **Single question, multiple frameworks** — Enter one question and run it through CoT, ReAct, ReWOO, and/or Plan-Execute with the same model and settings.
- **Live reasoning** — Each panel streams the model’s reasoning (and tool use for ReAct/Plan-Execute) as it runs.
- **Comparison** — After a run, compare answers and (optionally) token usage and cost across the frameworks you selected.
- **History** — Recent runs are stored locally so you can revisit them without re-running.

## Frameworks

| Framework | Description |
|-----------|-------------|
| **CoT** (Chain-of-Thought) | Step-by-step reasoning; the model explains its thinking before answering. |
| **ReAct** | Interleaves reasoning and actions (e.g. tool calls); can use search, calculators, etc. |
| **ReWOO** | Plans a full decomposition first, then executes steps without interleaving observations. |
| **Plan-Execute** | Plans high-level steps, executes them, and can replan if needed. |

## Setup

1. Clone the repo and install dependencies:

   ```bash
   git clone https://github.com/naveenkai/Agent-Thinking-Frameworks
   cd thinking-frameworks
   npm install
   ```

2. Start the app:

   ```bash
   npm start
   ```

3. Open [http://localhost:3000](http://localhost:3000), open **Settings**, and add your OpenAI API key. Choose model, number of samples, and whether to show cost estimates.

## Usage

1. Enter a question in the question bar (or pick one of the suggested examples).
2. Select which frameworks to run (one or more).
3. Click **Run** — each selected framework runs in its own panel and streams output.
4. When done, use the comparison view to see answers and (if enabled) token/cost breakdown.
5. Use the history panel to open a previous run.

Your API key is kept in session storage; framework selection is stored in localStorage.

## Scripts

- `npm start` — Development server at [http://localhost:3000](http://localhost:3000)
- `npm run build` — Production build in `build/`
- `npm test` — Run tests

## Tech

- React 19, Create React App
- OpenAI-compatible API (model and API key in settings)
- Markdown rendering for reasoning and answers (remark-gfm)

## License

Private. Use and modify as you like within your own setup.

# Core Module Examples

Runnable examples demonstrating the `source/core/` agent primitives.

## Prerequisites

```bash
npm install   # installs zod and other dependencies
```

## Running

Each example is a standalone TypeScript file. Run with `npx tsx` from the project root:

```bash
# Tool registry, custom tools, error capture
npx tsx source/core/examples/01-tools-and-registry.ts

# Prompt templates, variable substitution, validation
npx tsx source/core/examples/02-prompts.ts

# Event log, context building, windowing, serialization
npx tsx source/core/examples/03-thread-and-context.ts

# Middleware hooks: logging, RAG injection, tool gating
npx tsx source/core/examples/04-middleware.ts

# Pure reducer: step through agent states manually
npx tsx source/core/examples/05-reducer.ts

# Full agent loop with mock model (no API key needed)
npx tsx source/core/examples/06-agent-loop.ts

# Error normalization, retries, LLM-friendly formatting
npx tsx source/core/examples/07-errors.ts

# Zod schema validation: strict, safe, discriminated unions
npx tsx source/core/examples/08-validation.ts
```

## Example Index

| #   | File                       | What it demonstrates                                                                         |
| --- | -------------------------- | -------------------------------------------------------------------------------------------- |
| 01  | `01-tools-and-registry.ts` | `createToolRegistry`, `defineTool`, `registerBashTool`, execute success/error/unknown        |
| 02  | `02-prompts.ts`            | `createPromptTemplate`, `renderPrompt`, `renderTemplate`, missing variable errors            |
| 03  | `03-thread-and-context.ts` | `createThread`, `deserializeThread`, `buildContext`, `estimateTokens`, tail windowing        |
| 04  | `04-middleware.ts`         | `createMiddlewareStack`, `onEvent`, `beforeModel`, `beforeToolExecution` (gating), `onError` |
| 05  | `05-reducer.ts`            | `initialState`, `reduce`, `nextAction` -- pure state machine walkthrough                     |
| 06  | `06-agent-loop.ts`         | `runAgent` end-to-end with mock model, tool execution, middleware logging                    |
| 07  | `07-errors.ts`             | `compactify`, `isRecoverable`, `formatForContext`, retry progression                         |
| 08  | `08-validation.ts`         | `validate*` (strict), `safeValidate*` (safe), discriminated union events, config validation  |

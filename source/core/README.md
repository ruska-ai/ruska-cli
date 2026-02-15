# Core Agent Module

Foundational agent primitives implementing the [12-Factor Agents](https://github.com/humanlayer/12-factor-agents/tree/main/content) design principles. This module is entirely self-contained and additive -- it does not modify any existing CLI code.

## Setup

The module requires `zod` for runtime schema validation:

```bash
npm install zod
```

All other dependencies are internal to the `@ruska/cli` package.

## Architecture

| File | Factor(s) | Description |
|------|-----------|-------------|
| `schemas.ts` | 1, 2, 3, 4, 5, 7, 9, 12 | Zod schemas as single source of truth for all types; TypeScript types inferred via `z.infer<>` |
| `middleware.ts` | 3, 8, 9 | Composable middleware system with typed hooks for observability, error handling, context injection |
| `errors.ts` | 9 | Error normalization with retry tracking and LLM-friendly formatting for self-healing |
| `prompt.ts` | 2 | Prompt-as-code with `{{variable}}` substitution, named/versioned templates |
| `thread.ts` | 5, 6 | Append-only event log with serialization for pause/resume |
| `context.ts` | 3, 9 | Builds model context window from events with tail windowing and error injection |
| `tool.ts` | 4 | Tool registry implementing the 3-step structured output pattern (LLM JSON -> execute -> feed back) |
| `bash-tool.ts` | 4, 11 | Bash tool delegating to existing `lib/local-tools/` infrastructure |
| `human.ts` | 7 | Human-in-the-loop as a structured tool |
| `agent.ts` | 6, 8, 10, 12 | Agent loop as stateless reducer with imperative driver |
| `model.ts` | 1 | LLM abstraction bridging to `StreamService` |

## Usage

### Define an agent config and run the loop

```typescript
import {
  type AgentConfig,
  initialState,
  runAgent,
  createToolRegistry,
  registerBashTool,
  createStreamModel,
  createMiddlewareStack,
} from '../core/index.js';

// 1. Configure the agent
const config: AgentConfig = {
  systemPrompt: 'You are a helpful coding assistant.',
  maxIterations: 10,
  maxErrors: 3,
};

// 2. Set up tools
const registry = createToolRegistry();
registerBashTool(registry);

// 3. Create middleware (optional)
const middleware = createMiddlewareStack();
middleware.use({
  name: 'logger',
  onEvent(event, state) {
    console.log(`[${event.type}] iterations=${state.iterations}`);
  },
});

// 4. Create model interface
const model = createStreamModel({ service: myStreamService });

// 5. Run the agent
const finalState = await runAgent({
  input: 'List files in the current directory',
  model,
  toolRegistry: registry,
  config,
  middleware,
});

console.log(finalState.status); // 'done' | 'error'
```

### Register a custom tool

```typescript
import { createToolRegistry, defineTool } from '../core/index.js';

const registry = createToolRegistry();

const weatherTool = defineTool('get_weather', 'Get current weather for a city', {
  city: { type: 'string', description: 'City name' },
});

registry.register(weatherTool, async (args) => {
  const city = args.city as string;
  return `Weather in ${city}: 72F, sunny`;
});
```

### Use prompts with variable substitution

```typescript
import { createPromptTemplate, renderTemplate } from '../core/index.js';

const template = createPromptTemplate(
  'coding-assistant',
  '1.0',
  'You are a {{language}} expert. Project: {{project}}.',
);

const prompt = renderTemplate(template, {
  language: 'TypeScript',
  project: 'ruska-cli',
});
// => "You are a TypeScript expert. Project: ruska-cli."
```

### Work with the event log

```typescript
import { createThread, deserializeThread } from '../core/index.js';

const thread = createThread();

thread.append({
  type: 'user_input',
  message: 'Hello',
  timestamp: Date.now(),
});

// Filter by event type
const errors = thread.eventsOfType('error');

// Serialize for pause/resume
const json = thread.serialize();
const restored = deserializeThread(json);
```

### Middleware hooks

```typescript
import { createMiddlewareStack, type Middleware } from '../core/index.js';

const rateLimiter: Middleware = {
  name: 'rate-limiter',
  async beforeToolExecution(toolCall, state) {
    if (state.iterations > 5 && toolCall.name === 'bash') {
      return false; // Skip execution
    }
    return true;
  },
};

const contextInjector: Middleware = {
  name: 'rag-injector',
  async beforeModel(messages, state) {
    return [
      ...messages,
      { role: 'user' as const, content: '[Retrieved context]: ...' },
    ];
  },
};

const stack = createMiddlewareStack();
stack.use(rateLimiter);
stack.use(contextInjector);
// Hooks execute in registration order
```

### Validate data at runtime

```typescript
import {
  validateToolCall,
  safeValidateToolCall,
} from '../core/index.js';

// Strict -- throws on invalid data
const toolCall = validateToolCall({
  id: 'tc_1',
  name: 'bash',
  args: { command: 'ls' },
});

// Safe -- returns { success, data?, error? }
const result = safeValidateToolCall(untrustedData);
if (result.success) {
  console.log(result.data);
}
```

## Examples

The `examples/` folder contains 8 runnable scripts covering every core primitive. No API keys needed -- examples use mock models where applicable.

```bash
npx tsx source/core/examples/01-tools-and-registry.ts  # Tool registry & custom tools
npx tsx source/core/examples/06-agent-loop.ts           # Full agent loop with mock model
```

See [`examples/README.md`](examples/README.md) for the full list.

## Module Dependency Graph

```
schemas.ts ─────────────────── FOUNDATION (all types)
  │
  ├── errors.ts ................. CompactError
  ├── prompt.ts ................. PromptTemplate
  ├── middleware.ts .............. AgentEvent, AgentState, CoreMessage, ToolCall, ToolResult, CompactError
  ├── thread.ts ................. AgentEvent
  ├── tool.ts ................... ToolCall, ToolDefinition, ToolResult
  ├── human.ts .................. HumanContactRequest, ToolDefinition
  ├── model.ts .................. CoreMessage, ToolDefinition, ModelResult, ToolCall
  │     └── lib/services/ ....... StreamServiceInterface, StreamMessage
  ├── bash-tool.ts .............. ToolDefinition, ToolExecutor, ToolRegistry
  │     └── lib/local-tools/ .... executeBash, formatResultForLlm
  ├── context.ts ................ AgentEvent, CoreMessage
  │     └── errors.ts ........... formatForContext
  │
  └── agent.ts ─────────────── INTEGRATOR (brings everything together)
        ├── middleware.ts ....... MiddlewareStack
        ├── tool.ts ............ ToolRegistry
        ├── model.ts ........... ModelInterface
        ├── context.ts ......... buildContext
        └── errors.ts .......... compactify
```

## Testing

All tests use [AVA](https://github.com/avajs/ava) and live in `source/__tests__/`. Tests run against compiled JavaScript in `dist/`.

### Run all tests (lint + build + AVA)

```bash
npm run test
```

### Run unit tests only (build + AVA, skip lint)

```bash
npm run test:unit
```

### Test files

| Test File | Module Under Test |
|-----------|-------------------|
| `core-schemas.test.ts` | `schemas.ts` -- parse, safeParse, invalid rejection, discriminated union |
| `core-middleware.test.ts` | `middleware.ts` -- registration, execution order, each hook type, async, no-op |
| `core-errors.test.ts` | `errors.ts` -- Error/string/unknown normalization, recoverability, formatting |
| `core-prompt.test.ts` | `prompt.ts` -- variable substitution, missing vars, template creation |
| `core-thread.test.ts` | `thread.ts` -- append, events, eventsOfType, serialize/deserialize roundtrip |
| `core-context.test.ts` | `context.ts` -- empty events, system prepend, message extraction, windowing, token estimation |
| `core-tool.test.ts` | `tool.ts` -- register, execute success/error/unknown, defineTool |
| `core-bash-tool.test.ts` | `bash-tool.ts` -- definition shape, executor output, registerBashTool |
| `core-human.test.ts` | `human.ts` -- tool definition shape, arg parsing valid/invalid/optional |
| `core-model.test.ts` | `model.ts` -- ModelInterface contract, message conversion |
| `core-agent.test.ts` | `agent.ts` -- initialState, reduce per event type, nextAction per status, iteration/error limits |

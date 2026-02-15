# Plan: Implement 12-Factor Agent Core Components

## Context

**Issue:** [#63 feat(12-factor-agent)](https://github.com/ruska-ai/ruska-cli/issues/63)

The CLI currently has a well-structured `lib/` with streaming, tools, and error handling, but lacks a unified agent abstraction. This change introduces a `source/core/` module implementing the foundational patterns from the [12-factor-agents](https://github.com/humanlayer/12-factor-agents/tree/main/content) design principles. The goal is to establish core primitives (model interface, prompt management, context building, tool registry, event log, agent loop) that can later replace the ad-hoc orchestration in `chat.tsx`.

**Approach:** Entirely additive -- no existing files are modified. The `core/` module is self-contained with its own types, tests, and barrel exports. TDD: tests written first for each module.

**Key design decisions:**
- **Zod schemas** enforce structured output validation at runtime (tool args, model results, events)
- **Middleware hooks** provide composable extension points for observability, error handling, context management, and dynamic prompts

---

## Prerequisites

### Add Zod dependency
```bash
npm install zod
```

Zod is used for runtime validation of structured outputs (Factor 4), model results, and agent events. TypeScript types are inferred from Zod schemas (`z.infer<>`) to ensure a single source of truth.

---

## Implementation Steps

### Step 1: Core Schemas & Types (`source/core/schemas.ts`)
**Factors:** 1, 2, 3, 4, 5, 7, 9, 12

Define Zod schemas as the **single source of truth** for all core types. TypeScript types are derived via `z.infer<>`.

```typescript
// Schemas (runtime validation)
export const CoreMessageSchema = z.object({...});
export const ToolCallSchema = z.object({...});
export const ModelResultSchema = z.object({...});
export const AgentEventSchema = z.discriminatedUnion('type', [...]);
// etc.

// Types (inferred from schemas)
export type CoreMessage = z.infer<typeof CoreMessageSchema>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
// etc.

// Validation helpers
export function validateToolCall(data: unknown): ToolCall { return ToolCallSchema.parse(data); }
export function safeValidateToolCall(data: unknown): z.SafeParseReturnType<...> { return ToolCallSchema.safeParse(data); }
```

| Schema | Inferred Type | Purpose |
|--------|--------------|---------|
| `CoreMessageSchema` | `CoreMessage` | Unified message format (`system/user/assistant/tool` roles) |
| `ToolCallSchema` | `ToolCall` | Structured tool call from model (`id`, `name`, `args`) |
| `ModelResultSchema` | `ModelResult` | Model output (`content` + `toolCalls[]`) |
| `PromptTemplateSchema` | `PromptTemplate` | Named, versioned prompt with variables |
| `ToolParameterSchemaSchema` | `ToolParameterSchema` | JSON Schema for tool parameters |
| `ToolDefinitionSchema` | `ToolDefinition` | Tool name + description + parameters |
| `ToolResultSchema` | `ToolResult` | Execution result (`toolCallId`, `content`, `isError`) |
| `AgentEventSchema` | `AgentEvent` | Discriminated union of all event types |
| `HumanContactRequestSchema` | `HumanContactRequest` | Structured human contact |
| `CompactErrorSchema` | `CompactError` | Error with retry tracking |
| `AgentStateSchema` | `AgentState` | Reducer accumulator |
| `AgentConfigSchema` | `AgentConfig` | Agent configuration |
| `AgentActionSchema` | `AgentAction` | Next action discriminated union |

**Pattern to follow:** Discriminated unions as in `source/types/stream.ts:StreamEvent` (line 150), but with Zod runtime validation.

### Step 2: Middleware System (`source/core/middleware.ts`)
**Factors:** 3, 8, 9 (cross-cutting concerns)

A composable middleware system with typed hooks for extending agent behavior without modifying core logic:

```typescript
export type Middleware = {
  name: string;

  // Observability: called on every event
  onEvent?: (event: AgentEvent, state: AgentState) => void | Promise<void>;

  // Error handling: intercept and optionally transform errors
  onError?: (error: CompactError, state: AgentState) => CompactError | Promise<CompactError>;

  // Context management: modify context before model invocation
  beforeModel?: (messages: CoreMessage[], state: AgentState) => CoreMessage[] | Promise<CoreMessage[]>;

  // Dynamic prompts: modify/inject system prompt based on state
  beforePrompt?: (systemPrompt: string, state: AgentState) => string | Promise<string>;

  // Tool execution: intercept before/after tool calls
  beforeToolExecution?: (toolCall: ToolCall, state: AgentState) => ToolCall | false | Promise<ToolCall | false>;
  afterToolExecution?: (toolCall: ToolCall, result: ToolResult, state: AgentState) => ToolResult | Promise<ToolResult>;
};

export type MiddlewareStack = {
  use(middleware: Middleware): void;
  runOnEvent(event: AgentEvent, state: AgentState): Promise<void>;
  runOnError(error: CompactError, state: AgentState): Promise<CompactError>;
  runBeforeModel(messages: CoreMessage[], state: AgentState): Promise<CoreMessage[]>;
  runBeforePrompt(systemPrompt: string, state: AgentState): Promise<string>;
  runBeforeToolExecution(toolCall: ToolCall, state: AgentState): Promise<ToolCall | false>;
  runAfterToolExecution(toolCall: ToolCall, result: ToolResult, state: AgentState): Promise<ToolResult>;
};

export function createMiddlewareStack(): MiddlewareStack;
```

**Middleware execution order:** Middlewares run in registration order. Each hook is optional -- middleware only needs to implement hooks it cares about.

**Hook semantics:**
- `onEvent` -- fire-and-forget observation (logging, metrics, tracing)
- `onError` -- transform/enrich errors before they enter context (e.g., add recovery hints)
- `beforeModel` -- modify context window (e.g., inject RAG results, trim history, add memory)
- `beforePrompt` -- dynamically adjust system prompt (e.g., based on iteration count or tool results)
- `beforeToolExecution` -- modify tool args or return `false` to skip (consent, rate limiting)
- `afterToolExecution` -- transform tool results (e.g., summarize, filter sensitive data)

### Step 2: Compact Errors (`source/core/errors.ts`)
**Factor:** 9

Pure functions for error normalization:
- `compactify(error: unknown, attempt, maxAttempts): CompactError` -- normalize any error
- `isRecoverable(error: CompactError): boolean` -- check retries remaining
- `formatForContext(error: CompactError): string` -- terse string for context injection

**Reuse pattern from:** `source/lib/output/error-handler.ts` (classifyError approach).

### Step 3: Prompt Manager (`source/core/prompt.ts`)
**Factor:** 2

Pure functions for prompt-as-code:
- `renderPrompt(template: string, variables: Record<string, string>): string` -- `{{variable}}` substitution
- `createPromptTemplate(name, version, template): PromptTemplate` -- extract variable names
- `renderTemplate(promptTemplate, variables): string` -- render with validation

### Step 4: Thread / Event Log (`source/core/thread.ts`)
**Factor:** 5, 6

Append-only event log as single source of truth:
- `createThread(initial?: AgentEvent[]): Thread` -- factory with `append`, `events`, `eventsOfType`, `length`, `serialize`
- `deserializeThread(json: string): Thread` -- hydrate from JSON (enables pause/resume)

**Pattern to follow:** Factory function returning a type object, as in `StreamServiceInterface` (`source/lib/services/stream-service.interface.ts`).

### Step 5: Context Builder (`source/core/context.ts`)
**Factor:** 3, 9

Build model context window from event log:
- `buildContext(events: AgentEvent[], options?: ContextOptions): CoreMessage[]` -- reconstruct messages from events, prepend system prompt, apply `maxMessages` windowing (preserve system msgs + tail)
- `estimateTokens(messages: CoreMessage[]): number` -- approximate token count

Error events are formatted into context for self-healing (Factor 9 integration).

### Step 6: Tool Registry (`source/core/tool.ts`)
**Factor:** 4

The 3-step structured output pattern (LLM JSON -> code executes -> results feed back):
- `createToolRegistry(): ToolRegistry` -- factory with `register`, `definitions`, `execute`, `has`
- `defineTool(name, description, parameters, required?): ToolDefinition` -- convenience builder
- `ToolExecutor` type: `(args) => Promise<string>`
- Tool args are validated via `ToolCallSchema` before execution
- Executor errors are caught and returned as `ToolResult` with `isError: true`
- Registration validates `ToolDefinitionSchema` to catch malformed definitions early

**Reuse pattern from:** `source/lib/tools.ts` tool name conventions.

### Step 7: Bash Tool (`source/core/bash-tool.ts`)
**Factor:** 4, 11 (local execution tool)

Register a `bash_tool` within the core tool system, delegating to the existing `lib/local-tools/` infrastructure:

- `bashToolDefinition: ToolDefinition` -- tool definition with `command` (required string), `cwd` (optional string), `timeout` (optional number) parameters
- `createBashExecutor(): ToolExecutor` -- factory that wraps `executeBash()` from `source/lib/local-tools/bash-executor.ts` and returns `formatResultForLlm()` output
- `registerBashTool(registry: ToolRegistry): void` -- convenience to register bash in a registry

**Key reuse:**
- `executeBash()` from `source/lib/local-tools/bash-executor.ts` -- actual command execution with security, timeout, output limits
- `formatResultForLlm()` from `source/lib/local-tools/bash-executor.ts` -- formats result for LLM context
- `validateCommand()` from `source/lib/local-tools/security.ts` -- already called inside `executeBash()`, no duplication needed

The bash tool is the **MVP concrete tool** that demonstrates the full Factor 4 loop: LLM outputs `{name: "bash_tool", args: {command: "ls -la"}}` -> `executeBash()` runs it -> `formatResultForLlm()` feeds result back to context.

### Step 8: Human Contact Tool (`source/core/human.ts`)
**Factor:** 7

Human interaction as a structured tool:
- `humanContactToolDefinition: ToolDefinition` -- standard tool definition for `contact_human`
- `parseHumanContactArgs(args): HumanContactRequest` -- validate LLM output
- `HumanContactHandler` type: `(request) => Promise<string>` -- abstract handler

### Step 9: Agent Loop / Reducer (`source/core/agent.ts`)
**Factors:** 6, 8, 10, 12

The centerpiece -- agent as stateless reducer:
- `initialState(config: AgentConfig): AgentState` -- create idle state (validated via `AgentConfigSchema`)
- `reduce(state: AgentState, event: AgentEvent): AgentState` -- **pure function**, no side effects
- `nextAction(state: AgentState): AgentAction` -- determine next step (Factor 8: separates decision from execution)
- `runAgent(input, model, toolRegistry, options): Promise<AgentState>` -- imperative loop driver

Key features:
- **Middleware integration:** `RunOptions` accepts a `MiddlewareStack`; the loop calls `runBeforeModel`, `runBeforePrompt`, `runBeforeToolExecution`, `runAfterToolExecution`, `runOnEvent`, and `runOnError` at appropriate points
- **Zod validation:** Model results validated via `ModelResultSchema.parse()` before processing; tool calls validated via `ToolCallSchema`
- `maxIterations` enforces small agent scope (Factor 10)
- `maxErrors` with retry guardrails (Factor 9)
- Loop terminates on `done` or `error` status

```typescript
export type RunOptions = {
  config: AgentConfig;
  middleware?: MiddlewareStack;   // Composable hooks
  onEvent?: (event: AgentEvent) => void;  // Simple event callback (convenience)
};
```

### Step 10: Model Interface (`source/core/model.ts`)
**Factor:** 1

Abstraction for LLM interaction (text in -> structured output):
- `ModelInterface` type: `{ invoke(messages, tools?): Promise<ModelResult> }`
- `createStreamModel(config: ModelConfig): ModelInterface` -- bridges to existing `StreamService`

Internal helpers convert between `CoreMessage` and `StreamMessage` (`source/types/stream.ts:170`), and between `ToolCall` and stream `tool_calls` format (`source/types/stream.ts:98`).

### Step 11: Barrel Export (`source/core/index.ts`)

Re-export all public API from core modules. Follow pattern of `source/types/index.ts`.

---

## Test Plan

All tests in `source/__tests__/` using AVA. One test file per core module:

| Test File | Module | Key Test Cases |
|-----------|--------|---------------|
| `core-schemas.test.ts` | schemas | Zod parse/safeParse for each schema, invalid data rejection, discriminated union validation, type inference correctness |
| `core-middleware.test.ts` | middleware | Stack registration, hook execution order, onEvent observation, onError transformation, beforeModel context modification, beforePrompt dynamic prompts, beforeToolExecution skip (returns false), afterToolExecution result transform, async hooks, no-op when no middleware |
| `core-errors.test.ts` | errors | Normalize Error/string/unknown, recoverability, formatting |
| `core-prompt.test.ts` | prompt | Variable substitution, missing vars throw, template creation, dedup |
| `core-thread.test.ts` | thread | Append, events, eventsOfType filtering, serialize/deserialize roundtrip |
| `core-context.test.ts` | context | Empty events, system prompt prepend, message extraction, windowing, token estimation |
| `core-tool.test.ts` | tool | Registry CRUD, execute success/error/unknown, defineTool convenience |
| `core-bash-tool.test.ts` | bash-tool | Bash tool definition shape, executor runs commands, formatResultForLlm output, registerBashTool convenience |
| `core-human.test.ts` | human | Tool definition shape, arg parsing valid/invalid/optional fields |
| `core-agent.test.ts` | agent | initialState, reduce for each event type, nextAction for each status, iteration/error limits |
| `core-model.test.ts` | model | ModelInterface contract, message conversion |

---

## Files to Create

```
source/core/
  schemas.ts          -- Zod schemas + inferred types (single source of truth)
  middleware.ts       -- Middleware system with typed hooks
  errors.ts
  prompt.ts
  thread.ts
  context.ts
  tool.ts
  bash-tool.ts
  human.ts
  agent.ts
  model.ts
  index.ts
source/__tests__/
  core-schemas.test.ts
  core-middleware.test.ts
  core-errors.test.ts
  core-prompt.test.ts
  core-thread.test.ts
  core-context.test.ts
  core-tool.test.ts
  core-bash-tool.test.ts
  core-human.test.ts
  core-agent.test.ts
  core-model.test.ts
```

**No existing files are modified.**

---

## Existing Files to Reference (Not Modify)

- `source/types/stream.ts` -- `StreamMessage`, `StreamRequest`, `ToolResultMessage` types for model.ts bridge
- `source/lib/services/stream-service.interface.ts` -- Interface pattern to follow
- `source/lib/services/stream-service.ts` -- Implementation that model.ts will delegate to
- `source/lib/tools.ts` -- Existing tool name conventions (`defaultAgentTools`)
- `source/lib/output/error-handler.ts` -- Error classification pattern to reference
- `source/lib/local-tools/bash-executor.ts` -- `executeBash()` and `formatResultForLlm()` to reuse in bash-tool.ts
- `source/lib/local-tools/security.ts` -- `validateCommand()` (already called inside executeBash)
- `source/lib/local-tools/types.ts` -- `BashExecutionOptions`, `BashToolResult` types

---

## Verification

1. **Build:** `npm run build` -- all new TypeScript compiles without errors
2. **Lint:** `npm run lint` -- passes XO + ESLint checks
3. **Test:** `npm run test` -- all 8 existing + 11 new test files pass
4. **CLI validation:** `npx ruska chat --message "hello"` -- existing functionality unaffected
5. **Import check:** Verify `source/core/index.ts` exports are importable from other modules

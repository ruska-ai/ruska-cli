# PRD: 12-Factor Agent Core Components

## Introduction

The ruska CLI currently has a well-structured `lib/` with streaming, tools, and error handling, but lacks a unified agent abstraction. This feature introduces a `source/core/` module implementing the foundational patterns from the [12-Factor Agents](https://github.com/humanlayer/12-factor-agents/tree/main/content) design principles. The module establishes core primitives -- model interface, prompt management, context building, tool registry, event log, middleware, and agent loop -- that can later replace the ad-hoc orchestration in `chat.tsx`.

The entire change is **additive**. No existing files are modified. The `core/` module is self-contained with its own types, tests, and barrel exports.

## Goals

- Establish a reusable, self-contained `source/core/` module with no modifications to existing code
- Implement all 12 factors as composable primitives (model interface, prompt manager, context builder, tool registry, event log, middleware system, agent loop)
- Use Zod schemas as the single source of truth for all core types, with TypeScript types inferred via `z.infer<>`
- Provide a composable middleware system with typed hooks for observability, error handling, context management, and dynamic prompts
- Achieve full test coverage via TDD with AVA -- one test file per core module (11 test files)
- Bridge to the existing `StreamService` and `lib/local-tools/` infrastructure without duplicating logic

## User Stories

### US-001: Define Core Schemas & Types

**Description:** As a developer, I want Zod schemas as the single source of truth for all agent types so that runtime validation and TypeScript types stay in sync automatically.

**Acceptance Criteria:**

- [ ] Create `source/core/schemas.ts` with Zod schemas for: `CoreMessage`, `ToolCall`, `ModelResult`, `PromptTemplate`, `ToolParameterSchema`, `ToolDefinition`, `ToolResult`, `AgentEvent` (discriminated union), `HumanContactRequest`, `CompactError`, `AgentState`, `AgentConfig`, `AgentAction`
- [ ] All TypeScript types are derived via `z.infer<>` -- no manually duplicated type definitions
- [ ] Export `validate*()` (strict) and `safeValidate*()` (safe parse) helper functions for each schema
- [ ] `AgentEvent` uses `z.discriminatedUnion('type', [...])` to distinguish event types
- [ ] `CoreMessage` supports `system`, `user`, `assistant`, and `tool` roles
- [ ] Invalid data is rejected with descriptive Zod error messages
- [ ] All tests in `source/__tests__/core-schemas.test.ts` pass (parse, safeParse, invalid rejection, discriminated union, type inference)
- [ ] `npm run lint` passes
- [ ] `npm run build` compiles without errors

### US-002: Build Middleware System

**Description:** As a developer, I want a composable middleware system with typed hooks so that I can extend agent behavior (logging, error enrichment, context injection, tool interception) without modifying core logic.

**Acceptance Criteria:**

- [ ] Create `source/core/middleware.ts` exporting `Middleware` type and `createMiddlewareStack()` factory
- [ ] `Middleware` type has named hooks: `onEvent`, `onError`, `beforeModel`, `beforePrompt`, `beforeToolExecution`, `afterToolExecution` -- all optional
- [ ] `MiddlewareStack` exposes `use(middleware)` for registration and `run*()` methods for each hook
- [ ] Middlewares execute in registration order
- [ ] `onEvent` is fire-and-forget (observation only)
- [ ] `onError` transforms/enriches errors before context injection
- [ ] `beforeModel` modifies the message array before model invocation
- [ ] `beforePrompt` dynamically adjusts the system prompt based on state
- [ ] `beforeToolExecution` can modify tool args or return `false` to skip execution
- [ ] `afterToolExecution` transforms tool results before they enter context
- [ ] All hooks support async (return `Promise`)
- [ ] Stack with no middleware is a no-op passthrough
- [ ] All tests in `source/__tests__/core-middleware.test.ts` pass
- [ ] `npm run lint` passes

### US-003: Implement Compact Errors

**Description:** As a developer, I want normalized error handling with retry tracking so that errors are consistently formatted for LLM context and self-healing.

**Acceptance Criteria:**

- [ ] Create `source/core/errors.ts` with pure functions: `compactify(error, attempt, maxAttempts)`, `isRecoverable(error)`, `formatForContext(error)`
- [ ] `compactify` normalizes `Error`, `string`, and `unknown` inputs into `CompactError` shape
- [ ] `isRecoverable` checks remaining retries
- [ ] `formatForContext` produces a terse string suitable for LLM context injection
- [ ] Pattern follows `source/lib/output/error-handler.ts` (classifyError approach)
- [ ] All tests in `source/__tests__/core-errors.test.ts` pass
- [ ] `npm run lint` passes

### US-004: Implement Prompt Manager

**Description:** As a developer, I want prompt-as-code with variable substitution so that prompts are versioned, named, and validated at render time.

**Acceptance Criteria:**

- [ ] Create `source/core/prompt.ts` with pure functions: `renderPrompt(template, variables)`, `createPromptTemplate(name, version, template)`, `renderTemplate(promptTemplate, variables)`
- [ ] `renderPrompt` performs `{{variable}}` substitution
- [ ] `createPromptTemplate` extracts variable names from the template string
- [ ] `renderTemplate` validates all required variables are provided before rendering
- [ ] Missing variables throw a descriptive error
- [ ] All tests in `source/__tests__/core-prompt.test.ts` pass
- [ ] `npm run lint` passes

### US-005: Implement Thread / Event Log

**Description:** As a developer, I want an append-only event log as the single source of truth for agent history so that agent state can be reconstructed, serialized, and resumed.

**Acceptance Criteria:**

- [ ] Create `source/core/thread.ts` with `createThread(initial?)` factory and `deserializeThread(json)` hydrator
- [ ] `Thread` object exposes: `append(event)`, `events()`, `eventsOfType(type)`, `length`, `serialize()`
- [ ] Events are validated via `AgentEventSchema` on append
- [ ] `serialize()` / `deserializeThread()` roundtrip is lossless
- [ ] Factory pattern follows `StreamServiceInterface` (`source/lib/services/stream-service.interface.ts`)
- [ ] All tests in `source/__tests__/core-thread.test.ts` pass
- [ ] `npm run lint` passes

### US-006: Implement Context Builder

**Description:** As a developer, I want to build a model context window from the event log so that the LLM receives a properly formatted, windowed message array with error context for self-healing.

**Acceptance Criteria:**

- [ ] Create `source/core/context.ts` with `buildContext(events, options?)` and `estimateTokens(messages)`
- [ ] `buildContext` reconstructs `CoreMessage[]` from `AgentEvent[]`
- [ ] System prompt is prepended as first message
- [ ] `maxMessages` option applies tail windowing (preserves system messages + most recent N messages)
- [ ] Error events are formatted into context for self-healing (Factor 9)
- [ ] `estimateTokens` provides approximate token count
- [ ] All tests in `source/__tests__/core-context.test.ts` pass (empty events, system prepend, message extraction, windowing, token estimation)
- [ ] `npm run lint` passes

### US-007: Implement Tool Registry

**Description:** As a developer, I want a tool registry implementing the 3-step structured output pattern (LLM JSON -> code executes -> results feed back) so that tools are validated, executed safely, and errors are captured.

**Acceptance Criteria:**

- [ ] Create `source/core/tool.ts` with `createToolRegistry()` factory and `defineTool()` convenience builder
- [ ] `ToolRegistry` exposes: `register(definition, executor)`, `definitions()`, `execute(toolCall)`, `has(name)`
- [ ] `ToolExecutor` type: `(args: Record<string, unknown>) => Promise<string>`
- [ ] Tool args validated via `ToolCallSchema` before execution
- [ ] Executor errors are caught and returned as `ToolResult` with `isError: true`
- [ ] `register` validates `ToolDefinitionSchema` to catch malformed definitions early
- [ ] Tool name conventions follow `source/lib/tools.ts`
- [ ] All tests in `source/__tests__/core-tool.test.ts` pass (register, execute success/error/unknown, defineTool)
- [ ] `npm run lint` passes

### US-008: Implement Bash Tool

**Description:** As a developer, I want a `bash_tool` registered in the core tool system that delegates to the existing `lib/local-tools/` infrastructure so that the full Factor 4 loop is demonstrated end-to-end.

**Acceptance Criteria:**

- [ ] Create `source/core/bash-tool.ts` with `bashToolDefinition`, `createBashExecutor()`, and `registerBashTool(registry)`
- [ ] `bashToolDefinition` has parameters: `command` (required string), `cwd` (optional string), `timeout` (optional number)
- [ ] `createBashExecutor()` wraps `executeBash()` from `source/lib/local-tools/bash-executor.ts`
- [ ] Executor returns `formatResultForLlm()` output from `source/lib/local-tools/bash-executor.ts`
- [ ] No duplication of `validateCommand()` (already called inside `executeBash()`)
- [ ] `registerBashTool(registry)` is a convenience that registers definition + executor in one call
- [ ] All tests in `source/__tests__/core-bash-tool.test.ts` pass (definition shape, executor runs commands, formatResultForLlm output, registerBashTool convenience)
- [ ] `npm run lint` passes

### US-009: Implement Human Contact Tool

**Description:** As a developer, I want human interaction modeled as a structured tool so that the agent can request human input through the standard tool interface.

**Acceptance Criteria:**

- [ ] Create `source/core/human.ts` with `humanContactToolDefinition`, `parseHumanContactArgs(args)`, and `HumanContactHandler` type
- [ ] `humanContactToolDefinition` is a standard `ToolDefinition` for `contact_human`
- [ ] `parseHumanContactArgs` validates LLM output against `HumanContactRequestSchema`
- [ ] `HumanContactHandler` type: `(request: HumanContactRequest) => Promise<string>`
- [ ] All tests in `source/__tests__/core-human.test.ts` pass (tool definition shape, arg parsing valid/invalid/optional fields)
- [ ] `npm run lint` passes

### US-010: Implement Agent Loop / Reducer

**Description:** As a developer, I want an agent loop implemented as a stateless reducer so that agent behavior is predictable, testable, and composable with middleware.

**Acceptance Criteria:**

- [ ] Create `source/core/agent.ts` with `initialState(config)`, `reduce(state, event)`, `nextAction(state)`, and `runAgent(input, model, toolRegistry, options)`
- [ ] `initialState` creates an idle state validated via `AgentConfigSchema`
- [ ] `reduce` is a **pure function** with no side effects -- returns new state from `(state, event)`
- [ ] `nextAction` determines next step: `call_model`, `execute_tool`, `contact_human`, `done`, or `error`
- [ ] `runAgent` is the imperative loop driver that orchestrates model calls, tool execution, and middleware
- [ ] `RunOptions` accepts a `MiddlewareStack` -- loop calls all middleware hooks at appropriate points
- [ ] Model results validated via `ModelResultSchema.parse()` before processing
- [ ] `maxIterations` enforces small agent scope (Factor 10)
- [ ] `maxErrors` with retry guardrails (Factor 9)
- [ ] Loop terminates on `done` or `error` status
- [ ] All tests in `source/__tests__/core-agent.test.ts` pass (initialState, reduce for each event type, nextAction for each status, iteration/error limits)
- [ ] `npm run lint` passes

### US-011: Implement Model Interface

**Description:** As a developer, I want an LLM abstraction layer so that the agent loop is decoupled from the specific streaming implementation.

**Acceptance Criteria:**

- [ ] Create `source/core/model.ts` with `ModelInterface` type and `createStreamModel(config)` factory
- [ ] `ModelInterface`: `{ invoke(messages: CoreMessage[], tools?: ToolDefinition[]): Promise<ModelResult> }`
- [ ] `createStreamModel` bridges to existing `StreamService` (`source/lib/services/stream-service.ts`)
- [ ] Internal helpers convert between `CoreMessage` and `StreamMessage` (`source/types/stream.ts`)
- [ ] Internal helpers convert between `ToolCall` and stream `tool_calls` format
- [ ] All tests in `source/__tests__/core-model.test.ts` pass (ModelInterface contract, message conversion)
- [ ] `npm run lint` passes

### US-012: Create Barrel Export

**Description:** As a developer, I want a single entry point for the core module so that consumers import from `source/core/index.ts`.

**Acceptance Criteria:**

- [ ] Create `source/core/index.ts` re-exporting all public API from core modules
- [ ] Follow pattern of `source/types/index.ts`
- [ ] All exports are importable from `source/core/index.ts`
- [ ] `npm run build` compiles without errors
- [ ] `npm run lint` passes

### US-013: Write Core Module README

**Description:** As a developer, I want a README in `source/core/` so that I can quickly understand the module's purpose, architecture, setup, usage, and how to run tests.

**Acceptance Criteria:**

- [ ] Create `source/core/README.md`
- [ ] **Overview** section: describes the module's purpose and the 12-factor-agents design principles it implements
- [ ] **Architecture** section: lists each module file (`schemas.ts`, `middleware.ts`, `errors.ts`, `prompt.ts`, `thread.ts`, `context.ts`, `tool.ts`, `bash-tool.ts`, `human.ts`, `agent.ts`, `model.ts`) with a one-line description and which factor(s) it addresses
- [ ] **Setup** section: documents the `zod` dependency requirement and how to install (`npm install`)
- [ ] **Usage** section: provides code examples for key workflows -- creating an agent config, registering tools, running the agent loop, using middleware
- [ ] **Testing** section: documents how to run tests (`npm run test:unit`), lists all 11 test files, and describes the TDD approach
- [ ] **Module Dependency Graph** section: shows which modules depend on which (schemas is the foundation, agent depends on middleware + tool + model, etc.)
- [ ] `npm run lint` passes (no lint errors from the new file)

## Functional Requirements

- FR-1: Add `zod` as a project dependency (`npm install zod`)
- FR-2: All core types defined as Zod schemas in `source/core/schemas.ts`; TypeScript types derived via `z.infer<>`
- FR-3: Middleware system provides composable hooks (`onEvent`, `onError`, `beforeModel`, `beforePrompt`, `beforeToolExecution`, `afterToolExecution`) executing in registration order
- FR-4: Error normalization converts any thrown value into a `CompactError` with retry tracking and context-friendly formatting
- FR-5: Prompt manager supports `{{variable}}` substitution with named, versioned templates and missing-variable validation
- FR-6: Thread provides append-only event log with type filtering, serialization, and deserialization for pause/resume
- FR-7: Context builder reconstructs `CoreMessage[]` from events with system prompt prepend, tail windowing, and error injection for self-healing
- FR-8: Tool registry implements the 3-step structured output pattern with schema validation on registration, arg validation before execution, and error capture as `ToolResult`
- FR-9: Bash tool delegates to existing `executeBash()` and `formatResultForLlm()` with no logic duplication
- FR-10: Human contact tool models human interaction as a standard tool with validated request parsing
- FR-11: Agent loop is a stateless reducer (`reduce` is pure) with an imperative `runAgent` driver that integrates middleware, enforces `maxIterations` and `maxErrors`, and terminates on `done` or `error`
- FR-12: Model interface abstracts LLM interaction with bidirectional conversion between `CoreMessage`/`StreamMessage` and `ToolCall`/stream formats
- FR-13: Barrel export at `source/core/index.ts` re-exports all public API
- FR-14: `source/core/README.md` documents module overview, architecture, setup, usage examples, testing instructions, and module dependency graph

## Non-Goals

- No modifications to any existing files (`chat.tsx`, `lib/`, `types/`, etc.)
- No wiring of `core/` into the existing CLI chat flow in this phase
- No new CLI commands or flags
- No external package extraction -- `core/` lives inside `@ruska/cli` for now
- No persistent storage or database integration
- No UI components or Ink integration
- No MCP (Model Context Protocol) server/tool integration in this phase
- No authentication, authorization, or multi-user support

## Technical Considerations

- **New dependency:** `zod` must be added to `dependencies` (not devDependencies) since core schemas are runtime code
- **Existing infrastructure reuse:**
  - `source/types/stream.ts` -- `StreamMessage`, `StreamRequest`, `ToolResultMessage` types for model bridge
  - `source/lib/services/stream-service.interface.ts` -- Factory pattern reference
  - `source/lib/services/stream-service.ts` -- `StreamService` that `createStreamModel` delegates to
  - `source/lib/tools.ts` -- Tool name conventions (`defaultAgentTools`)
  - `source/lib/output/error-handler.ts` -- Error classification pattern reference
  - `source/lib/local-tools/bash-executor.ts` -- `executeBash()` and `formatResultForLlm()` to reuse
  - `source/lib/local-tools/security.ts` -- `validateCommand()` (already called inside `executeBash`)
  - `source/lib/local-tools/types.ts` -- `BashExecutionOptions`, `BashToolResult` types
- **Discriminated unions:** Follow pattern from `source/types/stream.ts:StreamEvent` (line 150), but with Zod runtime validation
- **Test runner:** AVA with tests compiled to `dist/__tests__/` (tests run against compiled JS)
- **Linter:** XO with `xo-react` extends and Prettier integration

## Success Metrics

- All 11 new test files pass (`npm run test`)
- `npm run build` compiles all new TypeScript without errors
- `npm run lint` passes with no new warnings or errors
- Existing CLI functionality is unaffected (`npx ruska chat --message "hello"` works)
- All exports from `source/core/index.ts` are importable
- Zero modifications to existing source files

## Open Questions

- Should `createStreamModel` accept the full `StreamService` instance or just a config object? (Leaning toward config for simplicity, with internal instantiation)
- What specific event types should `AgentEventSchema` discriminated union include? (Minimum: `model_call`, `model_result`, `tool_call`, `tool_result`, `error`, `human_contact`, `state_change`)
- Should `estimateTokens` use a simple character-based heuristic or integrate a tokenizer library? (Leaning toward simple heuristic to avoid new dependencies)

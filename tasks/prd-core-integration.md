# PRD: Core Apparatus & Bash Tool Execution Integration

## Introduction

The 12-Factor Agent Core module (`source/core/`) was built across 12 user stories (US-001 through US-012). All primitives are complete and tested: schemas, agent loop, model interface, tool registry, bash tool, human-in-the-loop, middleware, context builder, thread, prompt templates, and error handling.

**The problem:** The core module is entirely self-contained — it is NOT integrated into the main CLI. `chat.tsx` still uses ad-hoc React-hook-based orchestration for streaming, tool call detection, bash consent, and conversation continuation. Two parallel implementations exist for the same concerns.

**The outcome:** Wire the core agent apparatus into the CLI, unify bash tool execution under the middleware pattern, and eliminate duplicated orchestration logic. This is achieved through a dependency-ordered set of phases: barrel export, streaming adapter, consent middleware, thread persistence, agent runner factory, and finally TUI/JSON mode integration.

## Goals

- Create a barrel export (`source/core/index.ts`) as the single import point for all core public API
- Add `runAgentStream()` as an `AsyncGenerator` so the TUI can receive real-time agent events
- Build a framework-agnostic bash consent middleware using the existing `beforeToolExecution` hook
- Implement filesystem-based thread persistence for conversation continuation
- Create an `AgentRunner` factory that wires model, tools, middleware, and thread into a single entry point
- Rewrite `ChatCommandTui` in `chat.tsx` to use the core runner, eliminating ~150 lines of ad-hoc orchestration
- Rewrite `runJsonMode()` in `chat.tsx` to use the core runner, enabling bash tool execution in JSON mode

## User Stories

### US-015: Create Barrel Export

**Description:** As a developer, I want a single entry point for the core module so that all consumers import from `source/core/index.ts` instead of individual files.

**Acceptance Criteria:**

- [ ] Create `source/core/index.ts` (~50 lines)
- [ ] Re-export all public symbols: types/schemas/validators from `schemas.ts`, `runAgent`/`initialState`/`reduce`/`nextAction` from `agent.ts`, `ModelInterface`/`createStreamModel` from `model.ts`, `ToolRegistry`/`createToolRegistry` from `tool.ts`, `registerBashTool` from `bash-tool.ts`, `createMiddlewareStack` from `middleware.ts`, `buildContext` from `context.ts`, `createThread`/`deserializeThread` from `thread.ts`, `renderPrompt`/`createPromptTemplate` from `prompt.ts`, `compactify`/`isRecoverable`/`formatForContext` from `errors.ts`, `humanContactToolDefinition`/`parseHumanContactArgs` from `human.ts`
- [ ] `import { runAgent, createToolRegistry } from '../core/index.js'` compiles successfully
- [ ] `npm run build` compiles without errors
- [ ] `npm run test:unit` passes (no regressions)
- [ ] `npm run lint` passes

### US-016: Add Event Emitter Adapter (runAgentStream)

**Description:** As a developer, I want `runAgentStream()` as an `AsyncGenerator<AgentEvent, AgentState>` so that the TUI receives real-time events (model responses, tool calls, tool results) as they happen instead of waiting for the full loop to complete.

**Acceptance Criteria:**

- [ ] Modify `source/core/agent.ts` — add `runAgentStream()` (~80 lines)
- [ ] `runAgentStream()` is an `AsyncGenerator` that yields each `AgentEvent` as it occurs and returns the final `AgentState`
- [ ] `runAgent()` becomes a thin wrapper that consumes the generator and returns the final state (no breaking changes)
- [ ] New type `RunAgentStreamInput` extends `RunAgentInput` with optional `onEvent` callback
- [ ] Create `source/__tests__/core-agent-stream.test.ts` with tests for: mock model yields tool_call and tool_result events before done, existing `runAgent` behavior unchanged
- [ ] Modify `source/core/index.ts` — export `runAgentStream` and `RunAgentStreamInput`
- [ ] Existing `source/__tests__/core-agent.test.ts` passes unchanged (no regression)
- [ ] `npm run build` compiles without errors
- [ ] `npm run lint` passes

### US-017: Build Bash Consent Middleware

**Description:** As a developer, I want a framework-agnostic bash consent middleware so that bash command approval flows through the core middleware system instead of being hardcoded into React hooks.

**Acceptance Criteria:**

- [ ] Create `source/core/bash-consent-middleware.ts` (~70 lines)
- [ ] Export `createBashConsentMiddleware(handler)` factory function
- [ ] `ConsentHandler` type: `(command: string, risk: CommandRisk, warnings: string[]) => Promise<ConsentDecision>`
- [ ] `ConsentDecision` type: `{ approved: true } | { approved: false; reason: string }`
- [ ] Middleware activates only for `toolCall.name === 'bash'`
- [ ] Non-bash tools pass through without calling the handler
- [ ] Reuse `validateCommand()` and `assessCommandRisk()` from `source/lib/local-tools/security.ts`
- [ ] Blocked commands (per `validateCommand()`) return `false` (triggers "skipped by middleware" in agent.ts)
- [ ] Non-blocked commands delegate approval decision to the `ConsentHandler`
- [ ] Create `source/__tests__/core-bash-consent-middleware.test.ts` with tests for: blocked commands, approved commands, denied commands, non-bash tools passthrough, integration with `runAgent` using mock model requesting bash
- [ ] Modify `source/core/index.ts` — export `createBashConsentMiddleware`, `ConsentHandler`, `ConsentDecision`
- [ ] `npm run build` compiles without errors
- [ ] `npm run lint` passes

### US-018: Implement Thread Filesystem Persistence

**Description:** As a developer, I want threads to persist to disk so that the CLI's `-t <thread-id>` flag can load and continue previous conversations through the core module.

**Acceptance Criteria:**

- [ ] Create `source/core/thread-store.ts` (~70 lines)
- [ ] Export `ThreadStore` interface with methods: `save(id, thread)`, `load(id)`, `list()`, `delete(id)`
- [ ] Export `createFileThreadStore(dir)` factory with default dir `~/.ruska/threads/`
- [ ] `save()` uses `thread.serialize()` from `source/core/thread.ts` to write JSON to disk
- [ ] `load()` uses `deserializeThread()` from `source/core/thread.ts` to hydrate from JSON, returns `null` for non-existent IDs
- [ ] `list()` returns an array of thread ID strings from the directory
- [ ] `delete()` removes the thread file from disk
- [ ] Create `source/__tests__/core-thread-store.test.ts` using a temp directory for isolation, with tests for: roundtrip save/load, load non-existent returns null, list returns IDs, delete removes thread
- [ ] Modify `source/core/index.ts` — export `ThreadStore`, `createFileThreadStore`
- [ ] `npm run build` compiles without errors
- [ ] `npm run lint` passes

### US-019: Create Agent Runner Factory

**Description:** As a developer, I want a single `createAgentRunner(config)` factory that wires model, tools, middleware, and thread together from CLI-level options so that CLI commands have a single entry point for agent execution.

**Acceptance Criteria:**

- [ ] Create `source/core/runner.ts` (~120 lines)
- [ ] Export `createAgentRunner(config)` factory function
- [ ] `AgentRunnerConfig` type includes: `service` (StreamServiceInterface), `model?` (string), `assistantId?` (string), `threadId?` (string), `systemPrompt` (string), `maxIterations` (number), `maxErrors` (number), `enableBash` (boolean), `autoApprove` (boolean), `bashTimeout` (number), `consentHandler?` (ConsentHandler), `threadStore?` (ThreadStore)
- [ ] Internally creates `ToolRegistry` (optionally registers bash tool via `registerBashTool`)
- [ ] Internally creates `MiddlewareStack` (optionally adds consent middleware via `createBashConsentMiddleware`)
- [ ] Internally creates `ModelInterface` via `createStreamModel()`
- [ ] Calls `runAgentStream()` and returns the async generator
- [ ] If `threadId` provided, loads thread from `ThreadStore` and seeds events
- [ ] If `autoApprove` is true, bypasses consent handler for bash commands
- [ ] Create `source/__tests__/core-runner.test.ts` with tests for: bash-enabled + consent handler called, auto-approve bypasses prompt, thread ID loads and continues, non-bash mode has no bash tool
- [ ] Modify `source/core/index.ts` — export `createAgentRunner`, `AgentRunnerConfig`
- [ ] `npm run build` compiles without errors
- [ ] `npm run lint` passes

### US-020: Integrate Core Runner into TUI (chat.tsx)

**Description:** As a developer, I want `ChatCommandTui` in `chat.tsx` to use the core runner so that orchestration logic is consolidated in core and ~150 lines of ad-hoc code are eliminated.

**Acceptance Criteria:**

- [ ] Modify `source/commands/chat.tsx` — rewrite `ChatCommandTui` (lines ~153-529)
- [ ] Call `createAgentRunner()` with a `consentHandler` that resolves via React state (prompts user, resolves Promise on approve/deny)
- [ ] Iterate the event stream from the runner, updating React state on each event for rendering
- [ ] Keep existing presentation components (`BashConsentPrompt`, `BashBlockedPrompt`, `BashResultDisplay`) — they are pure UI
- [ ] Remove: `useBashConsent` hook usage, manual tool call detection `useEffect`, `continueConversation()`, `processedToolCalls` state, `continuationRequest` state
- [ ] Net reduction of ~150 lines in `chat.tsx`
- [ ] `npm run build` compiles without errors
- [ ] `npm run test:unit` passes
- [ ] Manual test: `ruska chat "list files" --bash` — consent prompt shown, execution works
- [ ] Manual test: `ruska chat "list files" --bash --auto-approve` — auto-approve works
- [ ] Manual test: `ruska chat "follow up" -t <thread-id>` — continuation works
- [ ] Manual test: `ruska chat "hello"` — normal streaming works
- [ ] Manual test: `ruska chat "hello" | cat` — auto-detects JSON mode

### US-021: Integrate Core Runner into JSON Mode (chat.tsx)

**Description:** As a developer, I want `runJsonMode()` in `chat.tsx` to use the core runner so that JSON mode benefits from core's tool execution and bash support instead of being a completely separate code path.

**Acceptance Criteria:**

- [ ] Modify `source/commands/chat.tsx` — rewrite `runJsonMode()` (lines ~535-623)
- [ ] Replace with core runner usage, mapping `AgentEvent` types to NDJSON format: `model_response` → `{type: "chunk"}`, `done` → `{type: "done"}`, `tool_result` → `{type: "tool_result"}`
- [ ] Consent handler: auto-approve if `--auto-approve`, otherwise deny (no interactive prompt in piped mode)
- [ ] Net reduction of ~40 lines
- [ ] Bash tool execution now works in JSON mode (currently impossible)
- [ ] `npm run build` compiles without errors
- [ ] `npm run test:unit` passes
- [ ] Manual test: `ruska chat "list files" --json --bash --auto-approve | jq .` — NDJSON with tool results

### US-022: Write Integration Roadmap into README

**Description:** As a developer, I want a `## Roadmap` section in the project README so that the integration plan, dependency graph, and versioning strategy are documented for contributors.

**Acceptance Criteria:**

- [ ] Append a `## Roadmap` section to `README.md` (before the `## Configuration` section, around line 388)
- [ ] Include the dependency graph showing P0 → P1A/P1B/P1C → P2A → P3A/P3B
- [ ] Document each phase with a one-paragraph summary
- [ ] Include the recommended versioning table (P0=0.2.0, P1*=0.3.0, P2A=0.4.0, P3*=0.5.0)
- [ ] `npm run lint` passes

## Functional Requirements

- FR-1: Barrel export at `source/core/index.ts` re-exports all public API from core modules (schemas, agent, model, tool, bash-tool, middleware, context, thread, prompt, errors, human)
- FR-2: `runAgentStream()` yields `AgentEvent` objects via `AsyncGenerator` and returns final `AgentState`; `runAgent()` becomes a thin wrapper consuming the generator
- FR-3: `createBashConsentMiddleware(handler)` intercepts bash tool calls via `beforeToolExecution`, delegates to framework-agnostic `ConsentHandler`, and uses existing `validateCommand()`/`assessCommandRisk()` from security.ts
- FR-4: `createFileThreadStore(dir)` persists threads as JSON files using `thread.serialize()`/`deserializeThread()` with CRUD operations (save, load, list, delete)
- FR-5: `createAgentRunner(config)` assembles `ToolRegistry`, `MiddlewareStack`, `ModelInterface`, and optional `ThreadStore` from a single config object and returns an event-streaming async generator
- FR-6: `ChatCommandTui` uses `createAgentRunner()` instead of ad-hoc orchestration; consent handler bridges to React state for interactive approval
- FR-7: `runJsonMode()` uses `createAgentRunner()` with event-to-NDJSON mapping; bash tool execution enabled in piped mode via auto-approve
- FR-8: README documents the integration roadmap with dependency graph and versioning plan

## Non-Goals

- No modifications to the existing core module files (schemas.ts, middleware.ts, errors.ts, prompt.ts, thread.ts, context.ts, tool.ts, bash-tool.ts, human.ts, model.ts) except where explicitly noted (agent.ts for runAgentStream, index.ts for new exports)
- No new CLI commands or flags beyond existing `--bash`, `--auto-approve`, `-t`
- No external package extraction — everything stays inside `@ruska/cli`
- No persistent storage beyond filesystem JSON files for threads
- No MCP server/tool integration
- No authentication or multi-user thread isolation
- No changes to existing commands (`ruska auth`, `ruska assistants`, `ruska models`, etc.)

## Technical Considerations

- **Dependency graph:** P0 blocks everything. P1A, P1B, P1C are independent (parallelizable). P2A requires all Phase 1 items. P3A and P3B require P2A and can be done in parallel.
- **Existing infrastructure reuse:**
  - `source/lib/local-tools/security.ts` — `validateCommand()`, `assessCommandRisk()`, `CommandRisk` type for consent middleware
  - `source/lib/services/stream-service.interface.ts` — `StreamServiceInterface` for runner config
  - `source/core/thread.ts` — `serialize()`, `deserializeThread()` for thread persistence
  - `source/core/agent.ts` — `runAgent()` refactored into `runAgentStream()` wrapper
  - `source/core/model.ts` — `createStreamModel()` for runner factory
  - `source/core/bash-tool.ts` — `registerBashTool()` for runner factory
  - `source/core/middleware.ts` — `createMiddlewareStack()` for runner factory
- **React integration pattern:** The consent handler in P3A uses a Promise that resolves when React state updates (user approves/denies). This bridges the async middleware world with React's render cycle.
- **Versioning:** Stay in `0.x` until barrel export API is stable. P0=0.2.0, P1*=0.3.0, P2A=0.4.0, P3*=0.5.0.
- **Test runner:** AVA with tests compiled to `dist/__tests__/`. New test files: `core-agent-stream.test.ts`, `core-bash-consent-middleware.test.ts`, `core-thread-store.test.ts`, `core-runner.test.ts` (4 new test files, ~5 new tests total across existing + new).
- **Linter:** XO with known patterns documented in progress.txt (strictCamelCase, ES2020 target, import order, etc.)

## Success Metrics

- `npm run build` — clean compile with zero errors
- `npm run test` — all AVA tests pass (existing 19 + 4 new test files)
- Manual verification: `ruska chat "hello"` — TUI streaming works
- Manual verification: `ruska chat "list files" --bash` — consent + execution via core
- Manual verification: `ruska chat "hello" --json | jq .` — JSON mode via core
- Manual verification: `ruska chat "follow up" -t <id>` — thread continuation via core
- Existing commands unchanged: `ruska auth`, `ruska assistants`, `ruska models`
- Net reduction of ~190 lines in `chat.tsx` (orchestration logic moved to core)

## Open Questions

- Should `createAgentRunner` return the raw `AsyncGenerator` or wrap it in a higher-level object with `run()` / `stop()` methods?
- Should thread IDs be UUIDs or human-readable slugs (e.g., timestamp-based)?
- Should `createFileThreadStore` create the `~/.ruska/threads/` directory on first use or require it to exist?
- Should the consent handler in TUI mode have a configurable timeout before auto-denying?

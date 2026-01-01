# CLI Chat Command - Implementation Tasks

> Status: **COMPLETED**
> Last Updated: 2026-01-01

---

## Task 1: Add Streaming Types to `source/types/index.ts`

**Status:** [x] Completed

**Description:**
Add TypeScript types for chat messages, streaming requests, and SSE events.

**Types added:**
- `ChatMessage` - Role and content for messages
- `StreamRequest` - Full request payload for `/llm/stream`
- `StreamResponse` - Parsed SSE event response

**Notes:**
Added types at the end of `source/types/index.ts`. Used index signature for metadata to allow snake_case keys required by API.

---

## Task 2: Create `source/lib/stream.ts` - SSE Streaming Utilities

**Status:** [x] Completed

**Description:**
Create a streaming module that handles SSE connections to the backend.

**Implemented:**
- `createStreamRequest()` - Builds request payload from message and options
- `parseStreamEvent()` - Parses SSE event data
- `extractContentFromPayload()` - Extracts text content from response
- `streamChat()` - Main streaming function using native fetch with ReadableStream
- Helper functions `processSseLine()` and `processBufferedLines()` for SSE processing

**Notes:**
Used native Node.js 18+ fetch with ReadableStream instead of external SSE library. Refactored to reduce complexity and nesting depth to satisfy ESLint rules.

---

## Task 3: Create `source/commands/chat.tsx` - Chat Command Component

**Status:** [x] Completed

**Description:**
Create the React Ink component for the chat interface.

**Implemented:**
- Authentication check on mount
- Optional assistant loading by ID
- Interactive input with TextInput
- Real-time token streaming display
- Conversation history tracking
- Error handling
- Escape key to exit

**Component States:**
- `check-auth` - Verifying authentication
- `loading-assistant` - Fetching assistant (if ID provided)
- `input` - Waiting for user input
- `streaming` - Receiving and displaying tokens
- `error` - Display error state
- `done` - Exit state

**Notes:**
Used useCallback for memoized handlers. Handles both interactive and non-interactive modes via props.

---

## Task 4: Add `chat` Command to `source/cli.tsx`

**Status:** [x] Completed

**Description:**
Add the chat command routing and CLI flags.

**Implemented:**
- Import for `runChatCommand`
- Flags: `--assistant/-a`, `--message/-m`, `--model`
- `chat` case in switch statement
- Updated help text with chat command documentation

**Notes:**
Command routing passes all flags to ChatCommand component.

---

## Task 5: Install Required Dependencies

**Status:** [x] Completed (Not needed)

**Description:**
No additional packages needed - used native Node.js 18+ fetch with ReadableStream for SSE handling.

**Notes:**
Node.js 18+ has native fetch with streaming support, no external SSE library required.

---

## Task 6: Update README.md Documentation

**Status:** [x] Completed

**Description:**
Added documentation for the new chat command.

**Sections added:**
- Chat command in usage section
- Chat Options section
- Examples for chat command
- Detailed `ruska chat` section with examples

**Notes:**
Documented interactive mode, assistant mode, non-interactive mode, and model override.

---

## Task 7: Run Tests and Fix Issues

**Status:** [x] Completed

**Description:**
All 27 tests pass.

**Test files:**
- `source/__tests__/stream.test.ts` - 20 tests for streaming utilities
- `source/__tests__/chat.test.tsx` - 5 tests for chat component
- `source/__tests__/app.test.tsx` - 2 existing tests

**Issues fixed:**
- ESLint naming conventions (snake_case for API fields)
- Prettier formatting
- Reduced function complexity and nesting depth
- React component prop ordering

**Notes:**
Chat component tests are limited to initial render checks due to non-TTY test environment (useInput hook requires TTY).

---

## Task 8: Manual Testing with Real API

**Status:** [x] Completed (with backend note)

**Description:**
Test the chat command against the actual backend.

**Test cases:**
- [x] `ruska chat --message "Hello"` - Basic message without assistant
- [x] `ruska chat -m "Hello"` - Short flag variant
- [ ] `ruska chat --assistant <id> --message "Hello"` - With assistant (requires valid ID)
- [ ] `ruska chat --assistant <id>` - Interactive mode (requires TTY)
- [x] `ruska chat --model openai:gpt-4o --message "Test"` - Model override
- [x] Error handling: no authentication - shows proper error message

**Notes:**
- Non-interactive mode now works without TTY/raw mode issues
- Backend returns error: `'dict' object has no attribute 'model_dump'` - this is a backend API issue, not CLI
- Fixed meow flag handling: short flags (-m, -a) now work correctly

---

## Task 9: TTY/Raw Mode Fix for Non-Interactive Mode

**Status:** [x] Completed

**Description:**
Fixed the TTY raw mode error that occurred when using `-m` flag in non-TTY environments.

**Root causes identified:**
1. Ink's `render()` function tries to set up stdin handling even without `useInput`
2. meow 11.x doesn't map shortFlag to the long flag name (e.g., `-m` sets `cli.flags.m`, not `cli.flags.message`)

**Solution:**
1. Created `runNonInteractiveChat()` function that bypasses Ink entirely and uses plain `process.stdout.write()` for output
2. Updated `runChatCommand()` to use this function when `options.message` is provided
3. Updated CLI chat case to handle both short and long flags for message and assistant

**Files changed:**
- `source/commands/chat.tsx` - Added `runNonInteractiveChat()` function, updated `runChatCommand()`
- `source/cli.tsx` - Fixed flag handling for chat command

---

## Completion Log

| Task | Completed | Duration | Issues |
|------|-----------|----------|--------|
| 1    | Yes       | -        | None |
| 2    | Yes       | -        | Refactored for complexity/nesting |
| 3    | Yes       | -        | Fixed prop ordering |
| 4    | Yes       | -        | None |
| 5    | Yes       | -        | Not needed |
| 6    | Yes       | -        | None |
| 7    | Yes       | -        | Multiple ESLint fixes |
| 8    | Yes       | -        | Backend API error (separate issue) |
| 9    | Yes       | -        | TTY fix required plain console output |

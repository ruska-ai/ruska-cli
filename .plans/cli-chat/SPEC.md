# CLI Chat Command - Streaming LLM Responses

## Overview

Add a `chat` command to the Ruska CLI that allows users to send messages to an assistant and receive streamed responses, token by token.

## API Analysis

### Backend Endpoint
The `/api/llm/stream` endpoint (from `backend/src/routes/v0/llm.py:70-107`) accepts:

```typescript
interface LLMRequest {
  input: {
    messages: Array<{
      role: 'user' | 'assistant' | 'system' | 'tool';
      content: string | Array<any>;
    }>;
    files?: Record<string, any>;
  };
  model?: string;  // default: 'openai:gpt-5-nano'
  system_prompt?: string;
  instructions?: string;
  tools?: string[];
  a2a?: Record<string, any>;
  mcp?: Record<string, any>;
  subagents?: any[];
  presidio?: { analyze?: boolean; anonymize?: boolean };
  metadata?: {
    thread_id?: string;
    assistant_id?: string;
    user_id?: string;
    // ...
  };
}
```

Response is **Server-Sent Events (SSE)** with the following event format:
- `event: message` - Contains `[streamMode, payload]` JSON
  - `streamMode = "messages"` - Token chunks with content
  - `streamMode = "values"` - State updates (files, todos)
  - `streamMode = "error"` - Error information
- `event: close` - Stream completed
- `event: error` - Error occurred

### Frontend Reference
From `frontend/src/hooks/useChat.ts` and `frontend/src/lib/services/threadService.ts`:
- Uses `sse.js` library for SSE handling
- Parses `payload[0]` as stream mode, `payload[1]` as data
- For `messages` mode, extracts content from `response.content`
- Authentication via `x-api-key` header or `Authorization: Bearer <token>`

## Implementation Design

### New Files

1. **`source/lib/stream.ts`** - SSE streaming utilities
   - `streamChat()` - Initiates SSE connection to `/llm/stream`
   - Event handlers for message, error, close events
   - Token extraction from SSE payloads

2. **`source/commands/chat.tsx`** - Chat command UI component
   - Interactive prompt for user input
   - Real-time token display as they stream in
   - Support for `--assistant` flag to use specific assistant
   - Support for `--message` flag for non-interactive mode

3. **`source/types/index.ts`** - Add types for streaming

### Modified Files

1. **`source/cli.tsx`** - Add chat command routing
2. **`source/lib/api.ts`** - Add streaming method to ApiClient
3. **`README.md`** - Document new chat command

### Command Interface

```bash
# Interactive mode (default)
$ ruska chat --assistant <assistant-id>

# Single message mode
$ ruska chat --assistant <assistant-id> --message "Hello, how are you?"

# With model override
$ ruska chat --assistant <assistant-id> --model openai:gpt-4o

# Without assistant (uses default model)
$ ruska chat --message "What is 2+2?"
```

### UI Flow

1. **Check authentication** - Load config, verify API key
2. **Load assistant** (if provided) - Fetch assistant details
3. **Display prompt** - Show input field for user message
4. **Send to /llm/stream** - POST request with SSE
5. **Stream tokens** - Display each token as it arrives
6. **Show completion** - Allow new message or exit

### Token Streaming Display

Example output showing token-by-token streaming:

```
You: What is the capital of France?

AI: The capital of France is Paris.

You: (type next message or press Esc to exit)
```

## Types

### New Types (in `source/types/index.ts`)

```typescript
// Chat message for streaming
export type ChatMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  id?: string;
};

// Streaming request payload
export type StreamRequest = {
  input: {
    messages: ChatMessage[];
  };
  model?: string;
  system_prompt?: string;
  tools?: string[];
  metadata?: {
    assistant_id?: string;
    thread_id?: string;
  };
};

// SSE event types
export type StreamEventType = 'messages' | 'values' | 'error';
```

## Dependencies

May need to add:
- `eventsource` or native `fetch` with ReadableStream for SSE handling
- No `sse.js` (browser-only) - use Node.js compatible alternative

## Error Handling

1. **No authentication** - Prompt to run `ruska auth`
2. **Invalid assistant ID** - Show "Assistant not found" error
3. **Network error** - Display connection error, allow retry
4. **Stream error** - Show error message from backend
5. **Rate limit** - Display rate limit message (200/day)

## Future Enhancements (Out of Scope for v1)

- Multi-turn conversation history persistence
- Tool call display and confirmation
- File attachments
- Conversation export
- Thread ID persistence for continuity

---

## Implementation Checklist

- [ ] Add streaming types to `source/types/index.ts`
- [ ] Create `source/lib/stream.ts` with SSE handling
- [ ] Create `source/commands/chat.tsx` component
- [ ] Add `chat` command to `source/cli.tsx`
- [ ] Add `--assistant`, `--message`, `--model` flags to CLI
- [ ] Update README.md with chat command documentation
- [ ] Run `npm test` and fix any issues
- [ ] Test with real API endpoint
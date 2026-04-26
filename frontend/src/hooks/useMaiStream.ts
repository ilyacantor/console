/**
 * useMaiStream — canonical Mai v8 SSE streaming hook.
 *
 * Sends the canonical envelope (message, session_id, surface_id, tenant_id,
 * operator_id, engagement_id?, page_context?) to Platform via the Console
 * SSE proxy and handles all five event types:
 *   content      — assistant text delta
 *   tool_use     — Mai invoked a tool (routed to onToolUse)
 *   tool_result  — tool dispatcher result (routed to onToolResult)
 *   done         — turn complete
 *   error        — hard failure (either surfaced as setError)
 *
 * Tenant + operator are loaded once from /api/auth/identity and cached.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadIdentity, type Identity } from '../api/identity';

export interface MaiToolUseEvent {
  tool_use_id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface MaiToolResultEvent {
  tool_use_id: string;
  name: string;
  result?: unknown;
  error?: string;
}

export interface UseMaiStreamOptions {
  onUserMessage: (text: string) => void;
  onComplete: (text: string) => void;
  session_id: string;
  surface_id?: string;
  page_context?: Record<string, unknown> | null;
  onToolUse?: (evt: MaiToolUseEvent) => void;
  onToolResult?: (evt: MaiToolResultEvent) => void;
}

export interface UseMaiStreamResult {
  sendMessage: (text: string) => Promise<void>;
  isStreaming: boolean;
  streamBuffer: string;
  isThinking: boolean;
  error: string | null;
  abort: () => void;
}

export function useMaiStream(options: UseMaiStreamOptions): UseMaiStreamResult {
  const {
    onUserMessage, onComplete, session_id, surface_id = 'console',
    page_context, onToolUse, onToolResult,
  } = options;

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const onUserMessageRef = useRef(onUserMessage);
  onUserMessageRef.current = onUserMessage;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onToolUseRef = useRef(onToolUse);
  onToolUseRef.current = onToolUse;
  const onToolResultRef = useRef(onToolResult);
  onToolResultRef.current = onToolResult;

  useEffect(() => {
    loadIdentity()
      .then(setIdentity)
      .catch((err: Error) => setError(err.message));
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;
      if (!identity) {
        setError('Mai identity not yet loaded — try again in a moment.');
        return;
      }

      setError(null);
      const trimmed = text.trim();

      onUserMessageRef.current(trimmed);

      setIsThinking(true);
      setIsStreaming(true);
      setStreamBuffer('');

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const envelope = {
          message: trimmed,
          session_id,
          surface_id,
          tenant_id: identity.tenant_id,
          operator_id: identity.operator_id,
          page_context: page_context ?? null,
        };

        const response = await fetch('/api/proxy/platform/api/mai/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(envelope),
          signal: controller.signal,
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => response.statusText);
          throw new Error(
            `Mai chat failed — POST /api/proxy/platform/api/mai/chat returned ${response.status}: ${detail}`,
          );
        }

        if (!response.body) {
          throw new Error(
            'Mai chat failed — response body is null (streaming not supported)',
          );
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        let sseBuffer = '';
        let streamingDone = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });

          const frames = sseBuffer.split('\n\n');
          sseBuffer = frames.pop() || '';

          for (const frame of frames) {
            if (!frame.startsWith('data:')) continue;
            const jsonStr = frame.replace(/^data:\s*/, '');
            if (!jsonStr) continue;

            let event: {
              type?: string;
              text?: string;
              tool_use_id?: string;
              name?: string;
              input?: Record<string, unknown>;
              result?: unknown;
              error?: string;
            };
            try {
              event = JSON.parse(jsonStr);
            } catch {
              continue;
            }

            if (event.type === 'content' && typeof event.text === 'string') {
              accumulated += event.text;
              setStreamBuffer(accumulated);
              setIsThinking(false);
            } else if (
              event.type === 'tool_use' &&
              event.tool_use_id &&
              event.name
            ) {
              onToolUseRef.current?.({
                tool_use_id: event.tool_use_id,
                name: event.name,
                input: event.input ?? {},
              });
              setIsThinking(true);
            } else if (
              event.type === 'tool_result' &&
              event.tool_use_id &&
              event.name
            ) {
              onToolResultRef.current?.({
                tool_use_id: event.tool_use_id,
                name: event.name,
                result: event.result,
                error: event.error,
              });
            } else if (event.type === 'error' && event.error) {
              throw new Error(event.error);
            } else if (event.type === 'done') {
              if (accumulated) {
                onCompleteRef.current(accumulated);
              }
              setStreamBuffer('');
              setIsStreaming(false);
              setIsThinking(false);
              streamingDone = true;
            }
          }
        }

        if (accumulated && !streamingDone) {
          onCompleteRef.current(accumulated);
          setStreamBuffer('');
          setIsStreaming(false);
          setIsThinking(false);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;

        const message =
          err instanceof Error ? err.message : 'Mai chat failed — unknown error';
        setError(message);
        setIsStreaming(false);
        setIsThinking(false);
        setStreamBuffer('');
      }
    },
    [isStreaming, identity, session_id, surface_id, page_context],
  );

  return { sendMessage, isStreaming, streamBuffer, isThinking, error, abort };
}

export default useMaiStream;

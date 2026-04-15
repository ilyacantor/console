/**
 * useMaiStream — SSE streaming hook for Mai chat.
 *
 * Manages: fetch lifecycle, SSE parsing, streaming state, abort control.
 * Does NOT manage: input text, message history, or global context.
 *
 * Console adaptation: routes through /api/proxy/platform/api/mai/chat
 */

import { useState, useRef, useCallback } from 'react';

export interface UseMaiStreamOptions {
  /** Called before fetch — caller adds user message to their store */
  onUserMessage: (text: string) => void;
  /** Called when streaming completes — caller commits mai response */
  onComplete: (text: string) => void;
  /** Page context for floating chat (sent as page_context in POST body) */
  page_context?: string | null;
  /** Session ID for the conversation */
  session_id: string;
  /** Context block prepended to API message (invisible to chat UI) */
  contextBlock?: string;
  /** Engagement ID for engagement-scoped chat */
  engagement_id?: string | null;
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
  const { onUserMessage, onComplete, page_context, session_id, contextBlock, engagement_id } = options;

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const onUserMessageRef = useRef(onUserMessage);
  onUserMessageRef.current = onUserMessage;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

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
        const apiMessage = contextBlock
          ? `${contextBlock}\n\n${trimmed}`
          : trimmed;

        const response = await fetch('/api/proxy/platform/api/mai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: apiMessage,
            page_context: page_context ?? null,
            session_id,
            engagement_id: engagement_id ?? null,
          }),
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

          const lines = sseBuffer.split('\n');
          sseBuffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6);
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);

              if (event.type === 'content') {
                accumulated += event.text;
                setStreamBuffer(accumulated);
                setIsThinking(false);
              } else if (event.type === 'done') {
                if (accumulated) {
                  onCompleteRef.current(accumulated);
                }
                setStreamBuffer('');
                setIsStreaming(false);
                setIsThinking(false);
                streamingDone = true;
              }
            } catch {
              // Partial JSON line — completed on next chunk
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
          err instanceof Error
            ? err.message
            : 'Mai chat failed — unknown error';
        setError(message);
        setIsStreaming(false);
        setIsThinking(false);
        setStreamBuffer('');
      }
    },
    [isStreaming, page_context, session_id, contextBlock, engagement_id],
  );

  return { sendMessage, isStreaming, streamBuffer, isThinking, error, abort };
}

export default useMaiStream;

/**
 * MaestraFloat — Floating Maestra access pill, chat panel, and side panel.
 *
 * Three modes:
 *   dormant — small pill in bottom-right corner
 *   chat    — floating chat panel above the pill position
 *   side    — full-height docked panel on the right edge
 *
 * Maintains its own conversation state in React state (separate from any
 * global context). Persists across SPA navigation, lost on refresh.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send,
  Loader2,
  X,
  Minus,
  MoreVertical,
  PanelRightOpen,
  PanelRightClose,
  Trash2,
  Copy,
  Download,
  Check,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { useMaestraStream } from '../hooks/useMaestraStream';
import { usePolledData } from '../hooks/usePolledData';
import { usePageContext, type PageContext } from '../context/MaestraPageContext';
import MAESTRA_PRESETS from './maestra/presets';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MaestraFloatProps {
  currentPage: string;
  onSideOpen: (open: boolean) => void;
}

interface FloatMessage {
  id: string;
  role: 'user' | 'maestra' | 'system';
  content: string;
  timestamp: number;
}

type FloatMode = 'dormant' | 'chat' | 'side';

interface MaestraStatusResponse {
  engagement_id?: string | null;
  status?: string | null;
  entity?: string | null;
}

// ---------------------------------------------------------------------------
// Format messages as Markdown for export
// ---------------------------------------------------------------------------

function formatMessagesAsMarkdown(messages: FloatMessage[]): string {
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const lines: string[] = [`# Maestra Chat — ${dateStr}`, ''];
  for (const msg of messages) {
    const time = new Date(msg.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    if (msg.role === 'system') {
      lines.push('---', `*${msg.content}*`, '');
    } else {
      const speaker = msg.role === 'user' ? 'You' : 'Maestra';
      lines.push(`**${speaker}** (${time})`, '', msg.content, '');
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}

// ---------------------------------------------------------------------------
// Page context → text block for API injection
// ---------------------------------------------------------------------------

function buildContextBlock(ctx: PageContext): string {
  const lines: string[] = [
    '[Page Context — not shown to user]',
    `Current tab: ${ctx.tabLabel || 'Unknown'} (${ctx.route})`,
  ];
  if (ctx.visibleErrors.length > 0) {
    lines.push(`Visible errors on screen: ${ctx.visibleErrors.join('; ')}`);
  }
  if (ctx.connectionStatus) lines.push(`Connection status: ${ctx.connectionStatus}`);
  if (ctx.dataState) lines.push(`Data state: ${ctx.dataState}`);
  if (ctx.activeSweep) lines.push(`Active sweep: ${ctx.activeSweep}`);
  if (ctx.activeEntity) lines.push(`Active entity: ${ctx.activeEntity}`);
  if (ctx.summary) lines.push(`Page note: ${ctx.summary}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MaestraFloat({ currentPage, onSideOpen }: MaestraFloatProps) {
  const [mode, setMode] = useState<FloatMode>('dormant');
  const [messages, setMessages] = useState<FloatMessage[]>([]);
  const [sessionId, setSessionId] = useState(
    () => `float-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  );
  const [input, setInput] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const lastEngagementRef = useRef<MaestraStatusResponse | null>(null);

  // -------------------------------------------------------------------
  // Page context — injected into API messages, invisible to UI
  // -------------------------------------------------------------------
  const { pageContext } = usePageContext();
  const contextBlock = buildContextBlock(pageContext);

  // -------------------------------------------------------------------
  // Streaming
  // -------------------------------------------------------------------
  const { sendMessage, isStreaming, streamBuffer, isThinking, error } = useMaestraStream({
    onUserMessage: (text) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: text,
          timestamp: Date.now(),
        },
      ]);
    },
    onComplete: (text) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'maestra',
          content: text,
          timestamp: Date.now(),
        },
      ]);
    },
    page_context: currentPage,
    session_id: sessionId,
    contextBlock,
  });

  // -------------------------------------------------------------------
  // Polling — only when panel is open
  // -------------------------------------------------------------------
  const { data: maestraStatus } = usePolledData<MaestraStatusResponse>(
    async () => {
      const res = await fetch('/api/proxy/platform/api/maestra/status');
      if (!res.ok) throw new Error(`Status fetch failed: ${res.status}`);
      return res.json();
    },
    15_000,
    [],
    { enabled: mode !== 'dormant' },
  );

  // Cache last known engagement so pill dot persists after closing
  useEffect(() => {
    if (maestraStatus) {
      const prevId = lastEngagementRef.current?.engagement_id;
      const newId = maestraStatus.engagement_id;
      if (prevId && newId && prevId !== newId && messages.length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'system',
            content: `Engagement changed: ${newId}`,
            timestamp: Date.now(),
          },
        ]);
      }
      lastEngagementRef.current = maestraStatus;
    }
  }, [maestraStatus, messages.length]);

  const hasEngagement = !!(lastEngagementRef.current?.engagement_id);

  // -------------------------------------------------------------------
  // Mode transitions
  // -------------------------------------------------------------------
  const openChat = useCallback(() => {
    setMode('chat');
    onSideOpen(false);
    setMenuOpen(false);
    setConfirmClear(false);
  }, [onSideOpen]);

  const openSide = useCallback(() => {
    setMode('side');
    onSideOpen(true);
    setMenuOpen(false);
    setConfirmClear(false);
  }, [onSideOpen]);

  const close = useCallback(() => {
    setMode('dormant');
    onSideOpen(false);
    setMenuOpen(false);
    setConfirmClear(false);
  }, [onSideOpen]);

  // -------------------------------------------------------------------
  // Keyboard: Escape closes panel
  // -------------------------------------------------------------------
  useEffect(() => {
    if (mode === 'dormant') return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [mode, close]);

  // Auto-scroll on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamBuffer, isThinking]);

  // Focus input when panel opens
  useEffect(() => {
    if (mode !== 'dormant') {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [mode]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmClear(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // -------------------------------------------------------------------
  // Input handlers
  // -------------------------------------------------------------------
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input;
    setInput('');
    sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = input;
      setInput('');
      sendMessage(text);
    }
  };

  const handleCopyToClipboard = () => {
    const md = formatMessagesAsMarkdown(messages);
    navigator.clipboard.writeText(md);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
    setMenuOpen(false);
  };

  const handleDownloadMarkdown = () => {
    const md = formatMessagesAsMarkdown(messages);
    const dateTag = new Date().toISOString().slice(0, 10);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maestra-chat-${dateTag}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  };

  const handleClearConversation = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setMessages([]);
    setSessionId(`float-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    setMenuOpen(false);
    setConfirmClear(false);
  };

  // -------------------------------------------------------------------
  // Engagement label
  // -------------------------------------------------------------------
  const engagementLabel = lastEngagementRef.current?.entity
    ? lastEngagementRef.current.entity
    : lastEngagementRef.current?.engagement_id
      ? `Engagement ${lastEngagementRef.current.engagement_id.slice(0, 8)}`
      : null;

  // -------------------------------------------------------------------
  // Presets for current page
  // -------------------------------------------------------------------
  const pageKey = currentPage.replace(/^\//, '').split('/')[0] || 'pipeline';
  const presets = MAESTRA_PRESETS[pageKey] || [];
  const showPresets = messages.length === 0 && !isStreaming;

  // -------------------------------------------------------------------
  // Shared chat UI (used by both chat and side modes)
  // -------------------------------------------------------------------
  const renderChatUI = () => (
    <>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{
          borderBottom: '0.5px solid var(--border)',
          background: 'var(--bg-surface)',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-sm font-bold leading-none"
            style={{ color: '#0BCAD9' }}
          >
            M
          </span>
          <span
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            Maestra
          </span>
          {engagementLabel && (
            <span
              className="text-xs truncate"
              style={{ color: 'var(--text-muted)' }}
            >
              {engagementLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Three-dot menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => {
                setMenuOpen(!menuOpen);
                setConfirmClear(false);
              }}
              className="p-1.5 rounded transition-colors"
              style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
              title="Menu"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-48 rounded-lg shadow-xl py-1 z-10"
                style={{
                  background: 'var(--bg-card)',
                  border: '0.5px solid var(--border)',
                }}
              >
                {mode === 'chat' && (
                  <button
                    onClick={openSide}
                    className="hidden md:flex w-full items-center gap-2 px-3 py-2 text-sm"
                    style={{ color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    <PanelRightOpen className="w-3.5 h-3.5" />
                    Open as side panel
                  </button>
                )}
                {mode === 'side' && (
                  <button
                    onClick={openChat}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm"
                    style={{ color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    <PanelRightClose className="w-3.5 h-3.5" />
                    Detach to floating panel
                  </button>
                )}
                {messages.length > 0 && (
                  <>
                    <div style={{ borderTop: '0.5px solid var(--border)', margin: '4px 0' }} />
                    <button
                      onClick={handleCopyToClipboard}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm"
                      style={{ color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      {copyFeedback ? <Check className="w-3.5 h-3.5" style={{ color: '#22C55E' }} /> : <Copy className="w-3.5 h-3.5" />}
                      {copyFeedback ? 'Copied!' : 'Copy to clipboard'}
                    </button>
                    <button
                      onClick={handleDownloadMarkdown}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm"
                      style={{ color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download as .md
                    </button>
                    <div style={{ borderTop: '0.5px solid var(--border)', margin: '4px 0' }} />
                    <button
                      onClick={handleClearConversation}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm"
                      style={{ color: '#EF4444', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {confirmClear ? 'Confirm clear' : 'Clear conversation'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {/* Minimize */}
          <button
            onClick={close}
            className="p-1.5 rounded transition-colors"
            style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          {/* Close */}
          <button
            onClick={close}
            className="p-1.5 rounded transition-colors"
            style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3 min-h-0"
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        {/* Presets — shown when conversation is empty */}
        {showPresets && (
          <div className="flex flex-col items-center justify-center h-full">
            <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
              Ask Maestra anything
            </p>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
              Context: {pageKey.replace(/-/g, ' ')}
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-xs">
              {presets.map((preset) => (
                <button
                  key={preset}
                  onClick={() => sendMessage(preset)}
                  className="px-3 py-1.5 text-xs rounded-full text-left"
                  style={{
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-card)',
                    border: '0.5px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.role === 'system') {
            return (
              <div key={msg.id} className="flex justify-center">
                <span
                  className="text-xs px-3 py-1 rounded-full"
                  style={{
                    color: 'var(--text-muted)',
                    background: 'var(--bg-hover)',
                  }}
                >
                  {msg.content}
                </span>
              </div>
            );
          }
          return (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className="rounded-lg px-3 py-2 text-sm"
                style={{
                  maxWidth: '85%',
                  background: msg.role === 'user' ? '#0BCAD9' : 'var(--bg-card)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                }}
              >
                {msg.role === 'maestra' ? (
                  <div className="maestra-markdown prose prose-invert prose-sm max-w-none">
                    <Markdown>{msg.content}</Markdown>
                  </div>
                ) : (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                )}
                <div
                  className="mt-1"
                  style={{ fontSize: '10px', color: 'var(--text-muted)', opacity: 0.6 }}
                >
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {/* Thinking indicator */}
        {isThinking && (
          <div className="flex justify-start">
            <div
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}
            >
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Maestra is thinking...
              </span>
            </div>
          </div>
        )}

        {/* Streaming buffer */}
        {streamBuffer && !isThinking && (
          <div className="flex justify-start">
            <div
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                maxWidth: '85%',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
              }}
            >
              <div className="maestra-markdown prose prose-invert prose-sm max-w-none">
                <Markdown>{streamBuffer}</Markdown>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex justify-start">
            <div
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                maxWidth: '85%',
                background: '#1A1520',
                border: '0.5px solid #3B2A50',
                color: '#EF4444',
              }}
            >
              {error}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="px-4 py-3 flex-shrink-0"
        style={{ borderTop: '0.5px solid var(--border)' }}
      >
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Maestra..."
            rows={1}
            className="flex-1 px-3 py-2 rounded-lg text-sm resize-none"
            style={{
              background: 'var(--bg-card)',
              border: '0.5px solid var(--border)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="px-3 py-2 rounded-lg transition-colors"
            style={{
              background: '#0BCAD9',
              color: '#fff',
              border: 'none',
              cursor: isStreaming || !input.trim() ? 'default' : 'pointer',
              opacity: isStreaming || !input.trim() ? 0.5 : 1,
            }}
          >
            {isStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </form>
    </>
  );

  // -------------------------------------------------------------------
  // Render: Dormant (pill)
  // -------------------------------------------------------------------
  if (mode === 'dormant') {
    return (
      <button
        onClick={openChat}
        className="fixed z-50 group flex items-center gap-0 rounded-full px-3 py-2.5 shadow-lg cursor-pointer"
        style={{
          bottom: '24px',
          right: '24px',
          background: 'var(--bg-surface)',
          border: '0.5px solid var(--border)',
        }}
        title="Ask Maestra"
      >
        <span
          className="text-base font-bold leading-none"
          style={{ color: '#0BCAD9' }}
        >
          M
        </span>
        {/* Engagement dot */}
        {hasEngagement && (
          <span
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
            style={{
              backgroundColor: '#0BCAD9',
              border: '2px solid var(--bg-surface)',
            }}
          />
        )}
        {/* Expanding label */}
        <span
          className="max-w-0 overflow-hidden group-hover:max-w-[120px] transition-all duration-200 whitespace-nowrap text-sm ml-0 group-hover:ml-2"
          style={{ color: 'var(--text-secondary)' }}
        >
          Ask Maestra
        </span>
      </button>
    );
  }

  // -------------------------------------------------------------------
  // Render: Chat (floating panel)
  // -------------------------------------------------------------------
  if (mode === 'chat') {
    return (
      <div
        className="fixed z-50 flex flex-col rounded-xl shadow-2xl"
        style={{
          bottom: '24px',
          right: '24px',
          width: '380px',
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: '60vh',
          background: 'var(--bg-surface)',
          border: '0.5px solid var(--border)',
        }}
      >
        {renderChatUI()}
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Render: Side (full-height panel)
  // -------------------------------------------------------------------
  return (
    <div
      className="fixed z-50 flex flex-col shadow-2xl"
      style={{
        top: '49px', /* below TopBar */
        right: 0,
        bottom: 0,
        width: '420px',
        maxWidth: 'calc(100vw - 48px)',
        background: 'var(--bg-surface)',
        borderLeft: '0.5px solid var(--border)',
      }}
    >
      {renderChatUI()}
    </div>
  );
}

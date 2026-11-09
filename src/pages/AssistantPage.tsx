import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { api, streamMessage } from "../api/client";
import type {
  Citation,
  ConversationDetail,
  ConversationMessage,
  ConversationSummary,
  ToolCallRecord,
} from "../api/types";

type ActivityKind = "tool" | "verify" | "revise" | "done" | "error";
type ActivityStatus = "running" | "ok" | "failed";

interface ActivityStep {
  id: string;
  kind: ActivityKind;
  label: string;
  detail?: string;
  status: ActivityStatus;
}

interface LiveTurn {
  answer: string;
  citations: Citation[];
  stage: "verifying" | "verified" | null;
  resetNote: string | null;
  warning: string | null;
}

const EMPTY_LIVE: LiveTurn = {
  answer: "",
  citations: [],
  stage: null,
  resetNote: null,
  warning: null,
};

const TOOL_LABELS: Record<string, string> = {
  search_policy: "Search policy passages",
  list_documents: "List policy documents",
  get_document: "Read policy document",
  search_history: "Look up search history",
  verify_answer: "Reviewer checks the draft answer",
};

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

function describeArguments(arguments_: Record<string, unknown>): string {
  const query = arguments_.query;
  if (typeof query === "string" && query.trim()) {
    return `“${query.trim()}”`;
  }
  const documentId = arguments_.document_id;
  if (typeof documentId === "string") {
    return `document ${documentId.slice(0, 8)}…`;
  }
  const entries = Object.entries(arguments_);
  if (entries.length === 0) return "";
  return entries
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ")
    .slice(0, 120);
}

function stepsFromMessage(message: ConversationMessage): ActivityStep[] {
  return (message.tool_calls ?? []).map((call: ToolCallRecord, index: number) => {
    const isVerify = call.name === "verify_answer";
    const argumentText = isVerify ? "" : describeArguments(call.arguments);
    const detail = [argumentText, call.summary].filter(Boolean).join(" · ");
    return {
      id: `${message.id}-${index}`,
      kind: isVerify ? "verify" : "tool",
      label: toolLabel(call.name),
      detail,
      status: call.ok ? "ok" : "failed",
    };
  });
}

function ActivitySteps({ steps }: { steps: ActivityStep[] }) {
  if (steps.length === 0) {
    return <p className="muted small">No steps recorded.</p>;
  }
  return (
    <ol className="activity-steps">
      {steps.map((step) => (
        <li key={step.id} className={`activity-step activity-${step.status}`}>
          <span className="activity-dot" aria-hidden="true" />
          <div className="activity-body">
            <span className="activity-label">{step.label}</span>
            {step.detail && <span className="activity-detail muted">{step.detail}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Citations({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;
  return (
    <ul className="citation-list">
      {citations.map((citation) => (
        <li key={citation.chunk_id}>
          <span className="citation-chip">
            [{citation.marker}] {citation.document_title}
            {citation.page_number !== null ? ` · page ${citation.page_number}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function AssistantBubble({
  content,
  citations,
  warning,
}: {
  content: string;
  citations: Citation[] | null;
  warning: string | null;
}) {
  return (
    <>
      <div className="answer-text">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
      <Citations citations={citations ?? []} />
      {warning && <p className="alert alert-warning">{warning}</p>}
    </>
  );
}

export function AssistantPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [live, setLive] = useState<LiveTurn | null>(null);
  const [activity, setActivity] = useState<ActivityStep[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const activityEndRef = useRef<HTMLDivElement | null>(null);
  const activitySeq = useRef(0);
  // The conversation the user is looking at. A turn that finishes after they
  // switched away must not overwrite the newly opened thread.
  const viewIdRef = useRef<string | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const page = await api.listConversations();
      setConversations(page.items);
    } catch {
      // The sidebar is a convenience; a failure should not block the chat.
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [live?.answer, activity.length, detail]);

  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activity.length]);

  const openConversation = useCallback(async (id: string) => {
    viewIdRef.current = id;
    setActiveId(id);
    setLive(null);
    setActivity([]);
    setError(null);
    setLoading(true);
    try {
      setDetail(await api.getConversation(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the conversation.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  function startNewConversation() {
    abortRef.current?.abort();
    viewIdRef.current = null;
    setActiveId(null);
    setDetail(null);
    setLive(null);
    setActivity([]);
    setError(null);
    setPendingUser(null);
  }

  async function reloadActive(id: string) {
    try {
      setDetail(await api.getConversation(id));
    } catch {
      // Keep showing what was already rendered.
    }
    void loadConversations();
  }

  async function handleDelete() {
    if (!activeId) return;
    try {
      await api.deleteConversation(activeId);
      startNewConversation();
      void loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the conversation.");
    }
  }

  function nextStepId(): string {
    activitySeq.current += 1;
    return `step-${activitySeq.current}`;
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setError("Enter at least two characters.");
      return;
    }
    setError(null);
    setSending(true);
    setPendingUser(trimmed);
    setDraft("");
    setLive({ ...EMPTY_LIVE });
    setActivity([]);

    const controller = new AbortController();
    abortRef.current = controller;
    let conversationId = activeId;

    try {
      if (!conversationId) {
        const created = await api.createConversation();
        conversationId = created.id;
        viewIdRef.current = created.id;
        setActiveId(created.id);
      }

      await streamMessage(
        conversationId,
        trimmed,
        {
          onToken: (chunk) =>
            setLive((current) => ({
              ...(current ?? EMPTY_LIVE),
              answer: (current ?? EMPTY_LIVE).answer + chunk,
            })),
          onToolCall: (event) =>
            setActivity((current) => [
              ...current,
              {
                id: event.id,
                kind: "tool",
                label: toolLabel(event.name),
                detail: describeArguments(event.arguments),
                status: "running",
              },
            ]),
          onToolResult: (event) =>
            setActivity((current) => {
              const existing = current.some((step) => step.id === event.id);
              if (!existing) {
                return [
                  ...current,
                  {
                    id: event.id,
                    kind: "tool",
                    label: toolLabel(event.name),
                    detail: event.summary,
                    status: event.ok ? "ok" : "failed",
                  },
                ];
              }
              return current.map((step) =>
                step.id === event.id
                  ? { ...step, status: event.ok ? "ok" : "failed", detail: event.summary }
                  : step,
              );
            }),
          onStatus: (stage) =>
            setActivity((current) => {
              if (stage === "verifying") {
                if (
                  current.some(
                    (step) => step.kind === "verify" && step.status === "running",
                  )
                ) {
                  return current;
                }
                return [
                  ...current,
                  {
                    id: nextStepId(),
                    kind: "verify",
                    label: "Reviewer checks the draft answer",
                    status: "running",
                  },
                ];
              }
              let updated = false;
              const next = current.map((step) => {
                if (step.kind === "verify" && step.status === "running") {
                  updated = true;
                  return { ...step, label: "Answer verified", status: "ok" as const };
                }
                return step;
              });
              if (updated) return next;
              return [
                ...current,
                {
                  id: nextStepId(),
                  kind: "verify",
                  label: "Answer verified",
                  status: "ok",
                },
              ];
            }),
          onAnswerReset: (event) =>
            setActivity((current) => [
              ...current,
              {
                id: nextStepId(),
                kind: "revise",
                label: "Reviewer sent the answer back",
                detail: event.reason || "Searching again with different wording.",
                status: "ok",
              },
            ]),
          onCitations: (citations) =>
            setLive((current) => ({ ...(current ?? EMPTY_LIVE), citations })),
          onDone: (event) =>
            setActivity((current) => [
              ...current,
              {
                id: nextStepId(),
                kind: "done",
                label: "Turn finished",
                detail: [event.warning, `${event.elapsed_ms} ms`]
                  .filter(Boolean)
                  .join(" · "),
                status: "ok",
              },
            ]),
          onError: (event) =>
            setActivity((current) => [
              ...current,
              {
                id: nextStepId(),
                kind: "error",
                label: "Assistant error",
                detail: event.detail,
                status: "failed",
              },
            ]),
        },
        controller.signal,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "The assistant failed.";
      setError(message);
      setActivity((current) => [
        ...current,
        {
          id: nextStepId(),
          kind: "error",
          label: "Assistant error",
          detail: message,
          status: "failed",
        },
      ]);
    } finally {
      abortRef.current = null;
      setSending(false);
      setPendingUser(null);
      setLive(null);
      if (conversationId && viewIdRef.current === conversationId) {
        await reloadActive(conversationId);
      } else {
        void loadConversations();
      }
      setActivity([]);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    void send(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!sending) void send(draft);
    }
  }

  const activeTitle =
    detail?.title ??
    conversations.find((conversation) => conversation.id === activeId)?.title ??
    "New conversation";

  const assistantMessages = (detail?.messages ?? []).filter(
    (message) => message.role === "ASSISTANT",
  );
  const historySections = assistantMessages
    .map((message, index) => ({
      id: message.id,
      turn: index + 1,
      at: clockTime(message.created_at),
      steps: stepsFromMessage(message),
    }))
    .filter((section) => section.steps.length > 0);

  return (
    <div className="page assistant-page">
      <section className="page-intro">
        <h1>Policy assistant</h1>
        <p className="muted">
          Ask follow-up questions in plain language. The assistant searches the policy
          corpus, can make several searches for a compound question, checks its own answer
          against the retrieved passages, and cites what it used.
        </p>
      </section>

      <div className="assistant-layout">
        <aside className="assistant-sidebar">
          <button type="button" className="button button-primary new-chat" onClick={startNewConversation}>
            New conversation
          </button>
          <h2 className="sidebar-heading">Conversations</h2>
          {conversations.length === 0 ? (
            <p className="muted small">Your conversations will appear here.</p>
          ) : (
            <ul className="conversation-list">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    className={`conversation-item${
                      conversation.id === activeId ? " active" : ""
                    }`}
                    onClick={() => void openConversation(conversation.id)}
                  >
                    <span className="conversation-title">{conversation.title}</span>
                    <span className="conversation-meta muted">
                      {conversation.message_count} message
                      {conversation.message_count === 1 ? "" : "s"} ·{" "}
                      {relativeTime(conversation.updated_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="chat-panel">
          <header className="chat-header">
            <h2>{activeTitle}</h2>
            {activeId && (
              <button type="button" className="button button-ghost" onClick={() => void handleDelete()}>
                Delete
              </button>
            )}
          </header>

          {error && <p className="alert alert-error">{error}</p>}

          <div className="chat-thread">
            {!activeId && !detail && !pendingUser && (
              <div className="empty-state">
                <h2>Ask about travel and expense policy</h2>
                <p className="muted">
                  Try “What is the hotel limit in tier-1 cities?”, “Do I need receipts for
                  taxis?”, or a compound question such as “What is the meal cap, and who
                  approves exceptions?”
                </p>
              </div>
            )}

            {loading && <p className="muted">Loading conversation…</p>}

            {detail?.messages.map((message: ConversationMessage) =>
              message.role === "USER" ? (
                <div key={message.id} className="chat-message chat-message-user">
                  <div className="chat-bubble">{message.content}</div>
                </div>
              ) : (
                <div key={message.id} className="chat-message chat-message-assistant">
                  <div className="chat-bubble">
                    <AssistantBubble
                      content={message.content}
                      citations={message.citations}
                      warning={message.warning}
                    />
                  </div>
                </div>
              ),
            )}

            {pendingUser && (
              <div className="chat-message chat-message-user">
                <div className="chat-bubble">{pendingUser}</div>
              </div>
            )}

            {sending && (
              <div className="chat-message chat-message-assistant">
                <div className="chat-bubble">
                  {live?.answer ? (
                    <div className="answer-text">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{live.answer}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="muted chat-working">
                      {live?.stage === "verifying"
                        ? "Checking the answer against the retrieved policy…"
                        : live?.resetNote
                          ? live.resetNote
                          : "Searching policy documents…"}
                    </p>
                  )}
                  {live?.stage === "verifying" && live.answer && (
                    <p className="muted small">Checking the answer against the policy…</p>
                  )}
                  <Citations citations={live?.citations ?? []} />
                </div>
              </div>
            )}

            <div ref={threadEndRef} />
          </div>

          <form className="chat-composer" onSubmit={handleSubmit}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a policy question… (Enter to send, Shift+Enter for a new line)"
              aria-label="Message the policy assistant"
              rows={2}
              disabled={sending}
            />
            {sending ? (
              <button
                type="button"
                className="button button-ghost"
                onClick={() => abortRef.current?.abort()}
              >
                Stop
              </button>
            ) : (
              <button type="submit" className="button button-primary" disabled={!draft.trim()}>
                Send
              </button>
            )}
          </form>
        </section>

        <aside className="activity-panel">
          <h2 className="sidebar-heading">Agent activity</h2>
          <p className="muted small">
            Every tool call, the reviewer’s check, and any retry, in order.
          </p>

          {historySections.length === 0 && !sending && (
            <p className="muted small">
              Steps appear here as the agent works, and stay with the conversation.
            </p>
          )}

          {historySections.map((section) => (
            <section key={section.id} className="activity-turn">
              <div className="activity-turn-header">
                <span>Turn {section.turn}</span>
                <span className="muted">{section.at}</span>
              </div>
              <ActivitySteps steps={section.steps} />
            </section>
          ))}

          {sending && (
            <section className="activity-turn activity-live">
              <div className="activity-turn-header">
                <span>Current turn</span>
                <span className="badge">live</span>
              </div>
              <ActivitySteps steps={activity} />
            </section>
          )}

          <div ref={activityEndRef} />
        </aside>
      </div>
    </div>
  );
}

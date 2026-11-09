import type {
  AnswerResetEvent,
  AnswerResponse,
  Citation,
  Conversation,
  ConversationDetail,
  ConversationList,
  DoneEvent,
  Paginated,
  PolicyDocument,
  SearchHistoryItem,
  SearchResponse,
  StartEvent,
  StreamErrorEvent,
  Token,
  ToolCallEvent,
  ToolResultEvent,
  User,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const TOKEN_STORAGE_KEY = "tepsir.access_token";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function storeToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : Array.isArray(payload?.detail)
          ? payload.detail.map((item: { msg?: string }) => item.msg ?? "").join(", ")
          : `Request failed (${response.status})`;
    throw new ApiError(detail, response.status, payload?.code);
  }
  return payload as T;
}

export const api = {
  login(email: string, password: string): Promise<Token> {
    return request<Token>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  register(payload: {
    email: string;
    full_name: string;
    password: string;
  }): Promise<User> {
    return request<User>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  me(): Promise<User> {
    return request<User>("/api/v1/users/me");
  },

  search(query: string, topK: number): Promise<SearchResponse> {
    return request<SearchResponse>("/api/v1/search", {
      method: "POST",
      body: JSON.stringify({ query, top_k: topK }),
    });
  },

  searchAnswer(query: string, topK: number): Promise<AnswerResponse> {
    return request<AnswerResponse>("/api/v1/search/answer", {
      method: "POST",
      body: JSON.stringify({ query, top_k: topK }),
    });
  },

  searchHistory(): Promise<Paginated<SearchHistoryItem>> {
    return request<Paginated<SearchHistoryItem>>("/api/v1/search/history?page_size=10");
  },

  listDocuments(): Promise<Paginated<PolicyDocument>> {
    return request<Paginated<PolicyDocument>>("/api/v1/documents?page_size=100");
  },

  uploadDocument(form: FormData): Promise<PolicyDocument> {
    return request<PolicyDocument>("/api/v1/documents", {
      method: "POST",
      body: form,
    });
  },

  deleteDocument(id: string): Promise<void> {
    return request<void>(`/api/v1/documents/${id}`, { method: "DELETE" });
  },

  listConversations(): Promise<ConversationList> {
    return request<ConversationList>("/api/v1/assistant/conversations?page_size=50");
  },

  createConversation(title?: string): Promise<Conversation> {
    return request<Conversation>("/api/v1/assistant/conversations", {
      method: "POST",
      body: JSON.stringify({ title: title ?? null }),
    });
  },

  getConversation(id: string): Promise<ConversationDetail> {
    return request<ConversationDetail>(`/api/v1/assistant/conversations/${id}`);
  },

  deleteConversation(id: string): Promise<void> {
    return request<void>(`/api/v1/assistant/conversations/${id}`, { method: "DELETE" });
  },
};

export interface AssistantStreamHandlers {
  onStart?: (event: StartEvent) => void;
  onToken?: (text: string) => void;
  onToolCall?: (event: ToolCallEvent) => void;
  onToolResult?: (event: ToolResultEvent) => void;
  onStatus?: (stage: "verifying" | "verified") => void;
  onAnswerReset?: (event: AnswerResetEvent) => void;
  onCitations?: (citations: Citation[]) => void;
  onDone?: (event: DoneEvent) => void;
  onError?: (event: StreamErrorEvent) => void;
}

function dispatchStreamEvent(block: string, handlers: AssistantStreamHandlers): void {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return;

  let data: unknown;
  try {
    data = JSON.parse(dataLines.join("\n"));
  } catch {
    return;
  }

  switch (event) {
    case "start":
      handlers.onStart?.(data as StartEvent);
      break;
    case "token": {
      const payload = data as { text?: string };
      if (payload.text) handlers.onToken?.(payload.text);
      break;
    }
    case "tool_call":
      handlers.onToolCall?.(data as ToolCallEvent);
      break;
    case "tool_result":
      handlers.onToolResult?.(data as ToolResultEvent);
      break;
    case "status": {
      const payload = data as { stage?: "verifying" | "verified" };
      if (payload.stage) handlers.onStatus?.(payload.stage);
      break;
    }
    case "answer_reset":
      handlers.onAnswerReset?.(data as AnswerResetEvent);
      break;
    case "citations": {
      const payload = data as { citations?: Citation[] };
      if (payload.citations) handlers.onCitations?.(payload.citations);
      break;
    }
    case "done":
      handlers.onDone?.(data as DoneEvent);
      break;
    case "error":
      handlers.onError?.(data as StreamErrorEvent);
      break;
    default:
      break;
  }
}

/**
 * Send a message and read the assistant's SSE turn.
 *
 * The shared ``request()`` helper buffers the whole body as JSON, which would
 * wait for the stream to finish before showing anything, so this reads the
 * ``ReadableStream`` directly and dispatches each frame as it arrives.
 */
export async function streamMessage(
  conversationId: string,
  content: string,
  handlers: AssistantStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const token = getStoredToken();
  const headers = new Headers({
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  });
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(
    `${API_BASE}/api/v1/assistant/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ content }),
      signal,
    },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : `Request failed (${response.status})`;
    throw new ApiError(detail, response.status, payload?.code);
  }
  if (!response.body) {
    throw new ApiError("This browser cannot read streamed responses.", 0);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        dispatchStreamEvent(block, handlers);
        boundary = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim()) {
      dispatchStreamEvent(buffer, handlers);
    }
  } finally {
    reader.releaseLock();
  }
}

import type {
  Paginated,
  PolicyDocument,
  SearchHistoryItem,
  SearchResponse,
  Token,
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
};

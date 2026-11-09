export type Role = "ROLE_ADMIN" | "ROLE_USER";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export type DocumentStatus = "PROCESSING" | "INDEXED" | "FAILED";

export interface PolicyDocument {
  id: string;
  title: string;
  description: string | null;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  checksum_sha256: string;
  status: DocumentStatus;
  chunk_count: number;
  error_message: string | null;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface SearchHit {
  chunk_id: string;
  document_id: string;
  document_title: string;
  chunk_index: number;
  page_number: number | null;
  content: string;
  score: number;
}

export interface SearchResponse {
  query: string;
  results: SearchHit[];
  elapsed_ms: number;
}

export interface Citation {
  marker: number;
  chunk_id: string;
  document_id: string;
  document_title: string;
  page_number: number | null;
  score: number;
}

export interface AnswerResponse {
  query: string;
  answer: string | null;
  citations: Citation[];
  results: SearchHit[];
  model: string | null;
  elapsed_ms: number;
  warning: string | null;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  top_k: number;
  result_count: number;
  created_at: string;
}

export type MessageRole = "USER" | "ASSISTANT";

export interface ToolCallRecord {
  name: string;
  arguments: Record<string, unknown>;
  ok: boolean;
  summary: string;
}

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: string;
  tool_calls: ToolCallRecord[] | null;
  citations: Citation[] | null;
  model: string | null;
  warning: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationSummary extends Conversation {
  message_count: number;
}

export interface ConversationDetail extends Conversation {
  messages: ConversationMessage[];
}

export interface ConversationList {
  items: ConversationSummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface ToolCallEvent {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultEvent {
  id: string;
  name: string;
  ok: boolean;
  summary: string;
}

export interface StartEvent {
  conversation_id: string;
  user_message_id: string;
  title: string;
  model: string;
}

export interface DoneEvent {
  message_id: string | null;
  elapsed_ms: number;
  model: string;
  warning: string | null;
}

export interface AnswerResetEvent {
  reason: string;
  attempt: number;
}

export interface StreamErrorEvent {
  detail: string;
  code: string;
}


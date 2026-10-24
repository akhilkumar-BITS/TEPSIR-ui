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

export interface SearchHistoryItem {
  id: string;
  query: string;
  top_k: number;
  result_count: number;
  created_at: string;
}

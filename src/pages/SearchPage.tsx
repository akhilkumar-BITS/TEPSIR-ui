import { useCallback, useEffect, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { api } from "../api/client";
import type { AnswerResponse, SearchHistoryItem, SearchResponse } from "../api/types";

type SearchMode = "passages" | "answer";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
}

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(5);
  const [mode, setMode] = useState<SearchMode>("passages");
  const [response, setResponse] = useState<SearchResponse | AnswerResponse | null>(null);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const page = await api.searchHistory();
      setHistory(page.items);
    } catch {
      // History is a convenience; a failure should not disturb search.
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const runSearch = useCallback(
    async (text: string, k: number, nextMode: SearchMode) => {
      const trimmed = text.trim();
      if (trimmed.length < 2) {
        setError("Enter at least two characters.");
        return;
      }
      setSearching(true);
      setError(null);
      try {
        const result =
          nextMode === "answer"
            ? await api.searchAnswer(trimmed, k)
            : await api.search(trimmed, k);
        setResponse(result);
        void loadHistory();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed.");
      } finally {
        setSearching(false);
      }
    },
    [loadHistory],
  );

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void runSearch(query, topK, mode);
  }

  function handleHistoryClick(item: SearchHistoryItem) {
    setQuery(item.query);
    setTopK(item.top_k);
    void runSearch(item.query, item.top_k, mode);
  }

  const answerResponse: AnswerResponse | null =
    response && "answer" in response ? response : null;

  return (
    <div className="page">
      <section className="page-intro">
        <h1>Search policy guidance</h1>
        <p className="muted">
          Ask a question in plain language. Passages are retrieved from indexed travel and
          expense policy documents and ranked by semantic similarity. In Answer mode the
          assistant summarises those passages and cites them.
        </p>
      </section>

      <form onSubmit={handleSubmit} className="search-bar">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. What is the hotel limit in tier-1 cities?"
          aria-label="Search policy documents"
        />
        <select
          value={topK}
          onChange={(event) => setTopK(Number(event.target.value))}
          aria-label="Number of results"
        >
          {[3, 5, 10, 20].map((value) => (
            <option key={value} value={value}>
              Top {value}
            </option>
          ))}
        </select>
        <button type="submit" className="button button-primary" disabled={searching}>
          {searching
            ? mode === "answer"
              ? "Generating…"
              : "Searching…"
            : mode === "answer"
              ? "Ask"
              : "Search"}
        </button>
      </form>

      <div className="mode-toggle" role="group" aria-label="Search mode">
        <button
          type="button"
          className={mode === "passages" ? "active" : ""}
          aria-pressed={mode === "passages"}
          onClick={() => setMode("passages")}
        >
          Passages
        </button>
        <button
          type="button"
          className={mode === "answer" ? "active" : ""}
          aria-pressed={mode === "answer"}
          onClick={() => setMode("answer")}
        >
          Answer
        </button>
      </div>

      {error && <p className="alert alert-error">{error}</p>}

      <div className="search-layout">
        <div className="search-results">
          {!response && !searching && (
            <div className="empty-state">
              <h2>Start with a question</h2>
              <p className="muted">
                Try “per diem for meals”, “flight class rules”, or “receipt requirements”.
              </p>
            </div>
          )}

          {answerResponse && (
            <section className="answer-card">
              <div className="answer-header">
                <h2>Answer</h2>
                {answerResponse.model && <span className="badge">{answerResponse.model}</span>}
              </div>
              {answerResponse.answer ? (
                <div className="answer-text">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {answerResponse.answer}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="muted">No answer generated.</p>
              )}
              {answerResponse.citations.length > 0 && (
                <ul className="citation-list">
                  {answerResponse.citations.map((citation) => (
                    <li key={citation.chunk_id}>
                      <a className="citation-chip" href={`#chunk-${citation.chunk_id}`}>
                        [{citation.marker}] {citation.document_title}
                        {citation.page_number !== null ? ` · page ${citation.page_number}` : ""}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {answerResponse.warning && (
                <p className="alert alert-warning">{answerResponse.warning}</p>
              )}
            </section>
          )}

          {response && (
            <div className="results-header">
              <span>
                {response.results.length} result{response.results.length === 1 ? "" : "s"} for{" "}
                <strong>{response.query}</strong>
              </span>
              <span className="muted">{response.elapsed_ms} ms</span>
            </div>
          )}

          {response?.results.length === 0 && (
            <div className="empty-state">
              <h2>No matching passages</h2>
              <p className="muted">
                Try rephrasing the question, or ask an administrator whether the relevant
                policy has been published.
              </p>
            </div>
          )}

          <ol className="result-list">
            {response?.results.map((hit) => (
              <li key={hit.chunk_id} id={`chunk-${hit.chunk_id}`} className="result-card">
                <div className="result-meta">
                  <span className="result-title">{hit.document_title}</span>
                  {hit.page_number !== null && (
                    <span className="badge">Page {hit.page_number}</span>
                  )}
                  <span className="score" title="Cosine similarity">
                    {Math.max(0, Math.round(hit.score * 100))}% match
                  </span>
                </div>
                <p className="result-content">{hit.content}</p>
              </li>
            ))}
          </ol>
        </div>

        <aside className="search-sidebar">
          <h2 className="sidebar-heading">Recent searches</h2>
          {history.length === 0 ? (
            <p className="muted small">Your searches will appear here.</p>
          ) : (
            <ul className="history-list">
              {history.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="history-item"
                    onClick={() => handleHistoryClick(item)}
                  >
                    <span className="history-query">{item.query}</span>
                    <span className="history-meta muted">
                      {item.result_count} result{item.result_count === 1 ? "" : "s"} ·{" "}
                      {relativeTime(item.created_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

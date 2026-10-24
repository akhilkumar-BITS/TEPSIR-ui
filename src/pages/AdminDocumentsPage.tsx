import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { api } from "../api/client";
import type { PolicyDocument } from "../api/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_LABEL: Record<PolicyDocument["status"], string> = {
  INDEXED: "Indexed",
  PROCESSING: "Processing",
  FAILED: "Failed",
};

export function AdminDocumentsPage() {
  const [documents, setDocuments] = useState<PolicyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const page = await api.listDocuments();
      setDocuments(page.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load policy documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Choose a document to upload.");
      return;
    }
    setUploading(true);
    setError(null);
    setNotice(null);

    const form = new FormData();
    form.append("file", file);
    form.append("title", title.trim());
    if (description.trim()) {
      form.append("description", description.trim());
    }

    try {
      await api.uploadDocument(form);
      setNotice(`"${title.trim()}" was uploaded and indexed.`);
      setTitle("");
      setDescription("");
      setFile(null);
      if (fileInput.current) {
        fileInput.current.value = "";
      }
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(doc: PolicyDocument) {
    const confirmed = window.confirm(
      `Delete "${doc.title}"? Its indexed passages will be removed from search.`,
    );
    if (!confirmed) return;
    try {
      await api.deleteDocument(doc.id);
      setNotice(`"${doc.title}" was deleted.`);
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  return (
    <div className="page">
      <section className="page-intro">
        <h1>Policy documents</h1>
        <p className="muted">
          Upload authoritative travel and expense policy documents. Each upload is parsed,
          split into passages, embedded and made searchable immediately.
        </p>
      </section>

      <div className="admin-layout">
        <section className="card">
          <h2 className="card-heading">Publish a document</h2>
          <form onSubmit={handleUpload} className="form">
            <label className="field">
              <span>Title</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Travel policy 2026"
                minLength={2}
                maxLength={300}
                required
              />
            </label>
            <label className="field">
              <span>Description (optional)</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
                placeholder="Scope, owner or effective date"
              />
            </label>
            <label className="field">
              <span>Document</span>
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={handleFileChange}
                required
              />
              <small className="muted">PDF, DOCX, TXT or MD · up to 25 MB</small>
            </label>

            <button type="submit" className="button button-primary" disabled={uploading}>
              {uploading ? "Uploading and indexing…" : "Upload document"}
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card-heading-row">
            <h2 className="card-heading">Published documents</h2>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => void loadDocuments()}
            >
              Refresh
            </button>
          </div>

          {error && <p className="alert alert-error">{error}</p>}
          {notice && <p className="alert alert-success">{notice}</p>}

          {loading ? (
            <p className="muted">Loading…</p>
          ) : documents.length === 0 ? (
            <p className="muted">No documents yet. Upload the first policy.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Passages</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id}>
                      <td>
                        <div className="doc-title">{doc.title}</div>
                        <div className="muted small">{doc.original_filename}</div>
                        {doc.status === "FAILED" && doc.error_message && (
                          <div className="doc-error">{doc.error_message}</div>
                        )}
                      </td>
                      <td>
                        <span className={`status status-${doc.status.toLowerCase()}`}>
                          {STATUS_LABEL[doc.status]}
                        </span>
                      </td>
                      <td>{doc.chunk_count}</td>
                      <td>{formatBytes(doc.size_bytes)}</td>
                      <td>{new Date(doc.created_at).toLocaleDateString()}</td>
                      <td className="table-actions">
                        <button
                          type="button"
                          className="button button-danger"
                          onClick={() => void handleDelete(doc)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

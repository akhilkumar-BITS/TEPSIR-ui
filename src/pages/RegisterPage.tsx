import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/search" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(email.trim(), fullName.trim(), password);
      navigate("/search", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create the account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">T</span>
          <div>
            <h1>TEPSIR</h1>
            <p className="muted">Travel &amp; Expense Policy Search</p>
          </div>
        </div>

        <h2 className="auth-heading">Create your account</h2>
        <p className="muted auth-subheading">
          Accounts can search published policy guidance. Policy documents are managed by
          administrators.
        </p>

        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            <span>Full name</span>
            <input
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              minLength={2}
              required
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
            <small className="muted">At least 8 characters.</small>
          </label>

          {error && <p className="alert alert-error">{error}</p>}

          <button type="submit" className="button button-primary" disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="auth-footer muted">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

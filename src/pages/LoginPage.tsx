import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
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
      await login(email.trim(), password);
      const target = (location.state as { from?: string } | null)?.from ?? "/search";
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
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

        <h2 className="auth-heading">Sign in</h2>
        <p className="muted auth-subheading">
          Search travel and expense policy guidance in plain language.
        </p>

        <form onSubmit={handleSubmit} className="form">
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
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error && <p className="alert alert-error">{error}</p>}

          <button type="submit" className="button button-primary" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="auth-footer muted">
          Need an account? <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  );
}

import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">T</span>
          <div>
            <div className="brand-name">TEPSIR</div>
            <div className="brand-tagline">Travel &amp; Expense Policy Search</div>
          </div>
        </div>

        <nav className="app-nav">
          <NavLink to="/search" className="nav-link">
            Search
          </NavLink>
          {user?.role === "ROLE_ADMIN" && (
            <NavLink to="/admin/documents" className="nav-link">
              Policies
            </NavLink>
          )}
        </nav>

        <div className="header-user">
          <span className="user-name">{user?.full_name}</span>
          <span className={`badge ${user?.role === "ROLE_ADMIN" ? "badge-admin" : ""}`}>
            {user?.role === "ROLE_ADMIN" ? "Administrator" : "User"}
          </span>
          <button type="button" className="button button-ghost" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

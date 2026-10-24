import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import type { Role } from "../api/types";

interface ProtectedRouteProps {
  children: ReactNode;
  role?: Role;
}

export function ProtectedRoute({ children, role }: ProtectedRouteProps) {
  const { user, initialising } = useAuth();

  if (initialising) {
    return <div className="centered muted">Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (role && user.role !== role) {
    return <Navigate to="/search" replace />;
  }
  return <>{children}</>;
}

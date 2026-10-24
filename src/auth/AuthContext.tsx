import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, getStoredToken, storeToken } from "../api/client";
import type { User } from "../api/types";

interface AuthContextValue {
  user: User | null;
  initialising: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, fullName: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initialising, setInitialising] = useState(true);

  // Resume a session from the stored token on first load.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!getStoredToken()) {
        setInitialising(false);
        return;
      }
      try {
        const profile = await api.me();
        if (!cancelled) {
          setUser(profile);
        }
      } catch {
        storeToken(null);
      } finally {
        if (!cancelled) {
          setInitialising(false);
        }
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const token = await api.login(email, password);
    storeToken(token.access_token);
    setUser(await api.me());
  }, []);

  const register = useCallback(
    async (email: string, fullName: string, password: string) => {
      await api.register({ email, full_name: fullName, password });
      await login(email, password);
    },
    [login],
  );

  const logout = useCallback(() => {
    storeToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, initialising, login, register, logout }),
    [user, initialising, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return context;
}

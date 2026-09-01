import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, onUnauthorized } from "./api";
import type { Me } from "./types";

interface AuthState {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  me: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      setMe(await api.get<Me>("/api/auth/me"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setMe(null);
      else throw err;
    }
  };

  useEffect(() => {
    const unsubscribe = onUnauthorized(() => setMe(null));
    refresh().finally(() => setLoading(false));
    return unsubscribe;
  }, []);

  const logout = async () => {
    await api.post("/api/auth/logout");
    setMe(null);
  };

  return (
    <AuthContext.Provider value={{ me, loading, refresh, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

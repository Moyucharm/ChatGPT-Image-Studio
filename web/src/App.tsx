import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import AccountsPage from "@/app/accounts/page";
import ImagePage from "@/app/image/page";
import AppShell from "@/app/layout";
import LoginPage from "@/app/login/page";
import HomePage from "@/app/page";
import RequestsPage from "@/app/requests/page";
import SettingsPage from "@/app/settings/page";
import { getStoredAuthSession, type AuthRole } from "@/store/auth";

type StoredAuthSession = {
  loaded: boolean;
  authKey: string;
  role: AuthRole | null;
};

function useStoredAuthSession(): StoredAuthSession {
  const { pathname } = useLocation();
  const [session, setSession] = useState<StoredAuthSession>({
    loaded: false,
    authKey: "",
    role: null,
  });

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      setSession({ loaded: false, authKey: "", role: null });
      try {
        const nextSession = await getStoredAuthSession();
        if (!cancelled) {
          setSession({
            loaded: true,
            authKey: nextSession.authKey,
            role: nextSession.role,
          });
        }
      } catch {
        if (!cancelled) {
          setSession({ loaded: true, authKey: "", role: null });
        }
      }
    };

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return session;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const session = useStoredAuthSession();

  if (!session.loaded) {
    return null;
  }

  if (session.authKey) {
    return <Navigate to="/image" replace />;
  }

  return children;
}

function ProtectedRoute({ children, allowedRoles }: { children: ReactNode; allowedRoles: AuthRole[] }) {
  const session = useStoredAuthSession();

  if (!session.loaded) {
    return null;
  }

  if (!session.authKey) {
    return <Navigate to="/login" replace />;
  }

  if (session.role && !allowedRoles.includes(session.role)) {
    return <Navigate to="/image" replace />;
  }

  return children;
}

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/image" element={<ProtectedRoute allowedRoles={["admin", "guest"]}><ImagePage /></ProtectedRoute>} />
        <Route path="/accounts" element={<ProtectedRoute allowedRoles={["admin"]}><AccountsPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute allowedRoles={["admin"]}><SettingsPage /></ProtectedRoute>} />
        <Route path="/requests" element={<ProtectedRoute allowedRoles={["admin"]}><RequestsPage /></ProtectedRoute>} />
      </Routes>
    </AppShell>
  );
}

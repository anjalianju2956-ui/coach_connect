import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { JourneyProvider } from "./context/JourneyContext";
import { ToastProvider, useToast } from "./context/ToastContext";
import { AppLayout, PublicLayout, RequireAuth } from "./components/layout/AppShell";
import { Icon } from "./components/ui/Icon";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { JourneyPage } from "./pages/JourneyPage";
import { DashboardPage } from "./pages/DashboardPage";
import { StallsPage } from "./pages/StallsPage";
import { StallMenuPage } from "./pages/StallMenuPage";
import { NotFoundPage } from "./pages/NotFoundPage";

/** Toast viewport — rendered once, outside the router. */
function ToastHost() {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div className="toasts" role="region" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.kind}`}>
          <Icon
            name={toast.kind === "error" ? "alert" : toast.kind === "ok" ? "checkCircle" : "info"}
            size={16}
          />
          <span>{toast.text}</span>
          <button type="button" className="toast__close" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="journey" element={<JourneyPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="stalls" element={<StallsPage />} />
          <Route path="stalls/:stallId" element={<StallMenuPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <JourneyProvider>
          <BrowserRouter>
            <AppRoutes />
            <ToastHost />
          </BrowserRouter>
        </JourneyProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon, type IconName } from "../ui/Icon";
import { Spinner } from "../ui/States";

/**
 * Application chrome:
 *   PublicLayout — landing + login (no tab bar)
 *   AppLayout    — authenticated pages with bottom navigation
 *   RequireAuth  — route guard
 */

function AppBar({ showLogout }: { showLogout: boolean }) {
  const { user, signOut, health } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="appbar">
      <Link to={user ? "/dashboard" : "/"} className="appbar__brand">
        <span className="appbar__mark">
          <Icon name="train" size={16} strokeWidth={2.1} />
        </span>
        Coach-Connect
      </Link>
      <span className="appbar__spacer" />
      {health?.auth === "demo" ? <span className="badge badge--demo">Demo mode</span> : null}
      {showLogout && user ? (
        <button
          type="button"
          className="appbar__link"
          onClick={async () => {
            await signOut();
            navigate("/");
          }}
        >
          <Icon name="user" size={15} />
          {user.demo ? "Demo user" : "Logout"}
        </button>
      ) : null}
    </header>
  );
}

function TabBar() {
  const location = useLocation();

  const items: Array<{ to: string; label: string; icon: IconName }> = [
    { to: "/dashboard", label: "Journey", icon: "train" },
    { to: "/stalls", label: "Stalls", icon: "store" },
  ];

  return (
    <nav className="tabbar" aria-label="Primary">
      {items.map((item) => {
        const active = location.pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`tabbar__item ${active ? "is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon name={item.icon} size={20} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function PublicLayout() {
  const { user } = useAuth();
  return (
    <div className="app">
      <AppBar showLogout={Boolean(user)} />
      <main className="main main--bare">
        <Outlet />
      </main>
    </div>
  );
}

export function AppLayout() {
  return (
    <div className="app">
      <AppBar showLogout />
      <main className="main">
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}

export function RequireAuth() {
  const { mode, user, health } = useAuth();
  const location = useLocation();

  if (mode === "loading") {
    return (
      <div className="app">
        <main className="main main--bare">
          <Spinner label="Starting Coach-Connect…" />
        </main>
      </div>
    );
  }

  if (!user) {
    // Remember where the passenger was heading so login can return them there.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  void health;
  return <Outlet />;
}

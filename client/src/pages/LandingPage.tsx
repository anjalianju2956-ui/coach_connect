import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Icon } from "../components/ui/Icon";
import { Banner } from "../components/ui/Button";

const STEPS = [
  { title: "Select your train", text: "Enter the train number and your coach — S1, B2, A1…" },
  { title: "Verify your journey", text: "GPS + movement + the train's route are checked together." },
  { title: "Discover stalls at your next station", text: "Only stalls at the station you are approaching are shown." },
  { title: "View menus and prices", text: "Browse stall details, item availability and menu prices." },
];

export function LandingPage() {
  const { user, health } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="stack" style={{ gap: 24 }}>
      <section className="hero">
        <div className="hero__inner">
          <span className="hero__eyebrow">
            <Icon name="train" size={15} /> Intelligent stall recommendations
          </span>
          <h1>Discover station stalls while travelling by train.</h1>
          <p>
            Coach-Connect verifies that you are actually travelling on your train, then shows only the
            stalls available at the station you are approaching, along with their menus and prices.
          </p>
          <div className="hero__actions">
            <button
              type="button"
              className="btn btn--accent btn--lg"
              onClick={() => navigate(user ? "/journey" : "/login?next=/journey")}
            >
              <Icon name="navigation" size={17} /> Start Journey
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--lg"
              style={{ color: "#fff", borderColor: "rgba(255,255,255,.35)" }}
              onClick={() => navigate("/login")}
            >
              Login
            </button>
          </div>
        </div>
      </section>

      <div className="stack stack--sm">
        <div className="section-title" style={{ margin: 0 }}>
          <h2>How it works</h2>
        </div>
        <div className="steps">
          {STEPS.map((step, index) => (
            <div className="step" key={step.title}>
              <span className="step__num">{index + 1}</span>
              <span>
                <span className="step__title">{step.title}</span>
                <div className="step__text">{step.text}</div>
              </span>
            </div>
          ))}
        </div>
      </div>

      <Banner tone="info" title="Not a normal food-delivery app">
        GPS near a station is <strong style={{ display: "inline" }}>not</strong> treated as proof of travel. If the
        journey cannot be confirmed, train-mode stall recommendations stay switched off.
      </Banner>

      {health && (
        <div className="card card__pad tiny muted" style={{ display: "grid", gap: 4 }}>
          <div className="row row--between">
            <span>Backend</span>
            <span className="strong">{health.service} v{health.version}</span>
          </div>
          <div className="row row--between">
            <span>Authentication</span>
            <span className="strong">{health.auth === "supabase" ? "Supabase (phone OTP)" : "Demo session"}</span>
          </div>
          <div className="row row--between">
            <span>Railway data</span>
            <span className="strong">
              {health.data.railkit ? "RailKit (live)" : "Built-in demo routes"}
            </span>
          </div>
          <div className="row row--between">
            <span>Stall catalogue</span>
            <span className="strong">{health.data.demoData ? "Includes DEMO stalls" : "Database only"}</span>
          </div>
        </div>
      )}

      <div className="row" style={{ justifyContent: "center" }}>
        <Link to={user ? "/dashboard" : "/login"} className="btn btn--quiet">
          {user ? "Open my dashboard" : "Create passenger account"}
        </Link>
      </div>
    </div>
  );
}

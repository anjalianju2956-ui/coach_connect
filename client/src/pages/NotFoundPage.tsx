import { Link } from "react-router-dom";
import { EmptyState } from "../components/ui/States";
import { Icon } from "../components/ui/Icon";

export function NotFoundPage() {
  return (
    <div className="stack">
      <div className="card card__pad">
        <EmptyState
          icon="search"
          title="Page not found"
          text="That link does not exist in the Coach-Connect passenger app."
          action={
            <Link to="/" className="btn btn--primary">
              <Icon name="train" size={16} /> Back home
            </Link>
          }
        />
      </div>
    </div>
  );
}

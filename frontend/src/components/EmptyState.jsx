import { Inbox } from "lucide-react";

export default function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <p className="empty-title">{title}</p>
      {description ? <p className="empty-copy">{description}</p> : null}
      {action ?? null}
    </div>
  );
}

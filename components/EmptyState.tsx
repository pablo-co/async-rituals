import type { ReactNode } from "react";

export function EmptyState({
  title,
  help,
  action,
}: {
  title: string;
  help?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h2 className="font-display text-(length:--text-lg)">{title}</h2>
      {help ? <p className="text-muted text-(length:--text-sm)">{help}</p> : null}
      {action}
    </div>
  );
}

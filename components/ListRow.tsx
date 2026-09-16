import type { ReactNode } from "react";

/** The most repeated unit of the web app (DESIGN.md list-row): title, muted meta, something on the right. */
export function ListRow({
  title,
  meta,
  right,
}: {
  title: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="list-row">
      <div className="list-row-main">
        <span className="list-row-title">{title}</span>
        {meta ? <span className="list-row-meta">{meta}</span> : null}
      </div>
      {right}
    </div>
  );
}

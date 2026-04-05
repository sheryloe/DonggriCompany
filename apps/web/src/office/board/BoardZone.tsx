import type { ReactNode } from "react";

type BoardZoneProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  className?: string;
};

export function BoardZone({ title, subtitle, children, className }: BoardZoneProps): JSX.Element {
  return (
    <article className={`board-zone${className ? ` ${className}` : ""}`}>
      <header className="board-zone-header">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </header>
      {children}
    </article>
  );
}

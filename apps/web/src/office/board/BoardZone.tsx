import type { ReactNode } from "react";

type BoardZoneProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function BoardZone({ title, subtitle, children }: BoardZoneProps): JSX.Element {
  return (
    <article className="board-zone">
      <header className="board-zone-header">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </header>
      {children}
    </article>
  );
}

import type { TycoonEventLogItem } from "../board/scene-types";
import {
  createOfficeTranslator,
  type OfficeTranslator
} from "../i18n/office-i18n";

type TycoonEventLogPanelProps = {
  events: TycoonEventLogItem[];
  t?: OfficeTranslator;
};

const categoryLabel: Record<TycoonEventLogItem["category"], string> = {
  system: "SYS",
  agent: "AGENT",
  validation: "VALID",
  error: "ERR"
};

export function TycoonEventLogPanel({
  events,
  t = createOfficeTranslator("en")
}: TycoonEventLogPanelProps): JSX.Element {
  return (
    <section className="card compact tycoon-log-panel" aria-label="Tycoon event log">
      <header>
        <h2>{t("log.title")}</h2>
        <p className="hint">{t("log.subtitle")}</p>
      </header>
      <div className="tycoon-log-list" role="log" aria-live="polite" aria-relevant="additions text">
        {events.length === 0 ? (
          <p className="hint">{t("log.empty")}</p>
        ) : (
          events.map((event) => (
            <article key={event.id} className={`tycoon-log-item category-${event.category}`}>
              <span className="tycoon-log-tick">[{event.tick.toString().padStart(4, "0")}]</span>
              <span className="tycoon-log-tag">{categoryLabel[event.category]}</span>
              <span className="tycoon-log-msg">{event.message}</span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

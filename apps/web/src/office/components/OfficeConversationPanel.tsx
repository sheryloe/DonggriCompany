"use client";

import { useMemo, useState } from "react";

import type { AgentGuidanceMessage } from "../avatar/agent-copy";
import { bossCommandRecipients } from "../board/office-agents";
import type { TycoonEventLogItem } from "../board/scene-types";
import { useBossCommandThreads } from "../hooks/useBossCommandThreads";
import {
  buildConversationEntries,
  recipientToActorId,
  type AgentConversationActor,
  type OfficeRightTab
} from "../lib/office-console";
import {
  createOfficeTranslator,
  type OfficeI18nKey,
  type OfficeTranslator
} from "../i18n/office-i18n";

type OfficeConversationPanelProps = {
  events: TycoonEventLogItem[];
  guidanceMessage: AgentGuidanceMessage | null;
  mainAgentName: string;
  contextChips?: string[];
  t?: OfficeTranslator;
};

const statusToneClass: Record<string, string> = {
  draft: "tone-draft",
  sent: "tone-sent",
  acknowledged: "tone-acknowledged",
  feedback: "tone-feedback",
  closed: "tone-closed"
};

const filterOptions: Array<{ actorId: AgentConversationActor; labelKey: OfficeI18nKey }> = [
  { actorId: "all", labelKey: "console.filter.all" },
  { actorId: "boss", labelKey: "console.filter.boss" },
  { actorId: "system", labelKey: "console.filter.system" },
  { actorId: "actor-main", labelKey: "console.filter.main" },
  { actorId: "actor-router", labelKey: "console.filter.router" },
  { actorId: "actor-runtime", labelKey: "console.filter.runtime" },
  { actorId: "actor-probe", labelKey: "console.filter.probe" },
  { actorId: "actor-history", labelKey: "console.filter.history" },
  { actorId: "actor-pm", labelKey: "console.filter.pm" }
];

const statusLabelKey = (status: string): OfficeI18nKey => {
  const keyMap: Record<string, OfficeI18nKey> = {
    draft: "console.status.draft",
    sent: "console.status.sent",
    acknowledged: "console.status.acknowledged",
    feedback: "console.status.feedback",
    closed: "console.status.closed"
  };
  return keyMap[status] ?? "console.status.sent";
};

export function OfficeConversationPanel({
  events,
  guidanceMessage,
  mainAgentName,
  contextChips = [],
  t = createOfficeTranslator("en")
}: OfficeConversationPanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<OfficeRightTab>("all-log");
  const [isFilterExpanded, setIsFilterExpanded] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<AgentConversationActor>("all");
  const [recipient, setRecipient] = useState<(typeof bossCommandRecipients)[number]["value"]>("pm");
  const [summary, setSummary] = useState("");
  const [commandBody, setCommandBody] = useState("");
  const [feedbackBody, setFeedbackBody] = useState("");
  const commandThreads = useBossCommandThreads();

  const conversationEntries = useMemo(
    () => buildConversationEntries(events, guidanceMessage, mainAgentName),
    [events, guidanceMessage, mainAgentName]
  );

  const filteredEntries = useMemo(() => {
    if (activeFilter === "all") {
      return conversationEntries;
    }
    return conversationEntries.filter((entry) => entry.actorId === activeFilter);
  }, [activeFilter, conversationEntries]);

  const onCreateThread = (): void => {
    const nextSummary = summary.trim();
    const nextBody = commandBody.trim();
    if (!nextSummary || !nextBody) {
      return;
    }
    commandThreads.createThread(recipient, nextSummary, nextBody);
    setSummary("");
    setCommandBody("");
  };

  const onAddFeedback = (): void => {
    if (!commandThreads.selectedThread || !feedbackBody.trim()) {
      return;
    }
    commandThreads.addFeedback(commandThreads.selectedThread.id, commandThreads.selectedThread.recipient, feedbackBody.trim());
    setFeedbackBody("");
  };

  return (
    <section className="office-console-panel card compact" aria-label={t("console.title")}>
      <header className="office-console-header">
        <div>
          <h2>{t("console.title")}</h2>
          <p className="hint">{t("console.subtitle")}</p>
        </div>
        {contextChips.length > 0 ? (
          <div className="office-console-context" aria-label={t("console.title")}>
            {contextChips.map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </div>
        ) : null}
        <div className="office-console-tabs" role="tablist" aria-label={t("console.title")}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "all-log"}
            className={activeTab === "all-log" ? "active" : ""}
            onClick={() => setActiveTab("all-log")}
          >
            {t("console.tab.allLog")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "boss-command"}
            className={activeTab === "boss-command" ? "active" : ""}
            onClick={() => setActiveTab("boss-command")}
          >
            {t("console.tab.bossCommand")}
          </button>
        </div>
      </header>

      {activeTab === "all-log" ? (
        <div className="office-console-tabpanel" role="tabpanel" data-testid="all-log-panel">
          <button
            type="button"
            className="secondary office-console-filter-toggle"
            onClick={() => setIsFilterExpanded((previous) => !previous)}
            aria-expanded={isFilterExpanded}
            aria-controls="office-console-filter-row"
          >
            {isFilterExpanded ? t("console.filter.hide") : t("console.filter.show")}
          </button>
          {isFilterExpanded ? (
            <div className="office-console-filter-row" id="office-console-filter-row" aria-label={t("console.filter.label")}>
              {filterOptions.map((option) => (
                <button
                  key={option.actorId}
                  type="button"
                  className={`secondary${activeFilter === option.actorId ? " active" : ""}`}
                  onClick={() => setActiveFilter(option.actorId)}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="office-console-feed">
            {filteredEntries.length === 0 ? (
              <p className="hint">{t("console.empty.allLog")}</p>
            ) : (
              filteredEntries.map((entry) => (
                <article key={entry.id} className={`office-console-feed-item tone-${entry.tone}`}>
                  <div className="office-console-feed-head">
                    <strong>{entry.speaker}</strong>
                    <span>{entry.meta}</span>
                  </div>
                  <h3>{entry.title}</h3>
                  <p>{entry.body}</p>
                </article>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="office-console-tabpanel office-console-command-panel" role="tabpanel" data-testid="boss-command-panel">
          <section className="office-command-compose">
            <label>
              <span>{t("console.recipient")}</span>
              <select value={recipient} onChange={(event) => setRecipient(event.target.value as typeof recipient)}>
                {bossCommandRecipients.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("console.summary")}</span>
              <input value={summary} onChange={(event) => setSummary(event.target.value)} placeholder={t("console.summaryPlaceholder")} />
            </label>
            <label>
              <span>{t("console.commandBody")}</span>
              <textarea value={commandBody} onChange={(event) => setCommandBody(event.target.value)} rows={4} placeholder={t("console.commandPlaceholder")} />
            </label>
            <button type="button" onClick={onCreateThread}>
              {t("console.send")}
            </button>
          </section>

          <div className="office-command-thread-layout">
            <div className="office-command-thread-list">
              {commandThreads.threads.length === 0 ? (
                <p className="hint">{t("console.empty.command")}</p>
              ) : (
                commandThreads.threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    className={`office-thread-card${commandThreads.selectedThreadId === thread.id ? " active" : ""}`}
                    onClick={() => commandThreads.selectThread(thread.id)}
                  >
                    <div className="office-thread-card-head">
                      <strong>{thread.summary}</strong>
                      <span className={`office-thread-status ${statusToneClass[thread.status]}`}>{t(statusLabelKey(thread.status))}</span>
                    </div>
                    <span>{bossCommandRecipients.find((item) => item.value === thread.recipient)?.label}</span>
                    <span>{new Date(thread.updatedAt).toLocaleString("ko-KR")}</span>
                  </button>
                ))
              )}
            </div>

            {commandThreads.selectedThread ? (
              <section className="office-thread-detail" data-testid="boss-command-thread-detail">
                <header>
                  <div>
                    <h3>{commandThreads.selectedThread.summary}</h3>
                    <p className="hint">
                      {t("console.threadRecipient")}: {bossCommandRecipients.find((item) => item.value === commandThreads.selectedThread?.recipient)?.label}
                    </p>
                  </div>
                  <span className={`office-thread-status ${statusToneClass[commandThreads.selectedThread.status]}`}>
                    {t(statusLabelKey(commandThreads.selectedThread.status))}
                  </span>
                </header>
                <div className="office-thread-messages">
                  {commandThreads.selectedThread.messages.map((message) => (
                    <article
                      key={message.id}
                      className={`office-thread-message ${message.sender === "boss" ? "from-boss" : "from-agent"}`}
                      data-actor-id={message.sender === "boss" ? "boss" : recipientToActorId(message.sender)}
                    >
                      <strong>{message.sender === "boss" ? t("console.filter.boss") : bossCommandRecipients.find((item) => item.value === message.sender)?.label}</strong>
                      <span>{new Date(message.createdAt).toLocaleString("ko-KR")}</span>
                      <p>{message.body}</p>
                    </article>
                  ))}
                </div>
                <div className="office-thread-actions">
                  <button type="button" className="secondary" onClick={() => commandThreads.updateStatus(commandThreads.selectedThread!.id, "acknowledged")}>
                    {t("console.action.acknowledge")}
                  </button>
                  <button type="button" className="secondary" onClick={() => commandThreads.updateStatus(commandThreads.selectedThread!.id, "closed")}>
                    {t("console.action.close")}
                  </button>
                </div>
                <label>
                  <span>{t("console.feedback")}</span>
                  <textarea value={feedbackBody} onChange={(event) => setFeedbackBody(event.target.value)} rows={3} placeholder={t("console.feedbackPlaceholder")} />
                </label>
                <button type="button" className="secondary" onClick={onAddFeedback}>
                  {t("console.action.addFeedback")}
                </button>
              </section>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

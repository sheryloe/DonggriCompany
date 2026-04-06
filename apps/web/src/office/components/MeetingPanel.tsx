"use client";

import { useState } from "react";

import type {
  CreateOfficeMeetingRequest,
  DepartmentView,
  OfficeMeetingView
} from "@workspace/shared";

import {
  createOfficeTranslator,
  type OfficeTranslator
} from "../i18n/office-i18n";

type MeetingPanelProps = {
  meetings: OfficeMeetingView[];
  departments: DepartmentView[];
  isMutating?: boolean;
  errorMessage?: string | null;
  onCreateMeeting: (payload: CreateOfficeMeetingRequest) => Promise<OfficeMeetingView | null>;
  onStartMeeting: (id: string) => Promise<OfficeMeetingView | null>;
  onCompleteMeeting: (id: string) => Promise<OfficeMeetingView | null>;
  onDeleteMeeting: (id: string) => Promise<boolean>;
  t?: OfficeTranslator;
};

const statusToneClass: Record<OfficeMeetingView["status"], string> = {
  scheduled: "tone-scheduled",
  in_progress: "tone-in-progress",
  completed: "tone-completed",
  cancelled: "tone-cancelled"
};

const meetingStatusKeyMap: Record<
  OfficeMeetingView["status"],
  Parameters<OfficeTranslator>[0]
> = {
  scheduled: "widget.meeting.status.scheduled",
  in_progress: "widget.meeting.status.inProgress",
  completed: "widget.meeting.status.completed",
  cancelled: "widget.meeting.status.cancelled"
};

export function MeetingPanel({
  meetings,
  departments,
  isMutating = false,
  errorMessage = null,
  onCreateMeeting,
  onStartMeeting,
  onCompleteMeeting,
  onDeleteMeeting,
  t = createOfficeTranslator("en")
}: MeetingPanelProps): JSX.Element {
  const [title, setTitle] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [agenda, setAgenda] = useState<string>("");

  const createMeeting = async (): Promise<void> => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return;
    }
    const created = await onCreateMeeting({
      title: trimmedTitle,
      meetingType: "planned",
      departmentId: departmentId || null,
      agenda: agenda.trim() || null
    });
    if (created) {
      setTitle("");
      setAgenda("");
    }
  };

  return (
    <section className="card office-widget office-meeting-panel" data-testid="meeting-panel">
      <header>
        <div>
          <h2>{t("widget.meeting.title")}</h2>
          <p className="hint">{t("widget.meeting.subtitle")}</p>
        </div>
      </header>

      <div className="form-grid two-cols">
        <label>
          <span>{t("widget.meeting.titleLabel")}</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("widget.meeting.titlePlaceholder")}
          />
        </label>
        <label>
          <span>{t("widget.meeting.department")}</span>
          <select
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
          >
            <option value="">{t("widget.meeting.departmentAll")}</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        <span>{t("widget.meeting.agenda")}</span>
        <textarea
          value={agenda}
          onChange={(event) => setAgenda(event.target.value)}
          rows={3}
          placeholder={t("widget.meeting.agendaPlaceholder")}
        />
      </label>

      <div className="row-actions">
        <button type="button" onClick={() => void createMeeting()} disabled={isMutating}>
          {t("widget.meeting.create")}
        </button>
      </div>

      {errorMessage ? <p className="error">{errorMessage}</p> : null}

      <div className="office-meeting-list" data-testid="meeting-list">
        {meetings.length === 0 ? (
          <p className="hint">{t("widget.meeting.empty")}</p>
        ) : (
          meetings.map((meeting) => (
            <article key={meeting.id} className="office-meeting-card">
              <header>
                <strong>{meeting.title}</strong>
                <span className={`office-meeting-status ${statusToneClass[meeting.status]}`}>
                  {t(meetingStatusKeyMap[meeting.status])}
                </span>
              </header>
              <p>
                <span>{t("widget.meeting.department")}:</span>
                <strong>
                  {meeting.departmentId
                    ? (departments.find((item) => item.id === meeting.departmentId)?.name ??
                      meeting.departmentId)
                    : t("widget.meeting.departmentAll")}
                </strong>
              </p>
              <p>
                <span>{t("widget.meeting.agenda")}:</span>
                <strong>{meeting.agenda || "-"}</strong>
              </p>
              <div className="row-actions">
                {meeting.status === "scheduled" ? (
                  <button
                    type="button"
                    className="secondary"
                    disabled={isMutating}
                    onClick={() => void onStartMeeting(meeting.id)}
                  >
                    {t("widget.meeting.start")}
                  </button>
                ) : null}
                {meeting.status === "in_progress" ? (
                  <button
                    type="button"
                    className="secondary"
                    disabled={isMutating}
                    onClick={() => void onCompleteMeeting(meeting.id)}
                  >
                    {t("widget.meeting.complete")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="secondary"
                  disabled={isMutating}
                  onClick={() => void onDeleteMeeting(meeting.id)}
                >
                  {t("widget.meeting.delete")}
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}


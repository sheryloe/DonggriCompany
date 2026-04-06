"use client";

import { useCallback, useEffect, useState } from "react";
import type { Meeting } from "@workspace/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4315";

export default function MeetingPanel({ taskId }: { taskId?: string }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const url = taskId ? `${API_BASE}/api/meetings?task_id=${taskId}` : `${API_BASE}/api/meetings`;
    const res = await fetch(url);
    const data = await res.json() as { ok: true; meetings: Meeting[] };
    setMeetings(data.meetings);
    setLoading(false);
  }, [taskId]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!newTitle.trim()) return;
    await fetch(`${API_BASE}/api/meetings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim(), taskId, meetingType: "planned" }),
    });
    setNewTitle("");
    setShowCreate(false);
    await load();
  };

  const updateStatus = async (id: string, action: "start" | "complete") => {
    await fetch(`${API_BASE}/api/meetings/${id}/${action}`, { method: "POST" });
    await load();
  };

  const STATUS_BADGES: Record<string, string> = {
    scheduled: "bg-blue-900/40 text-blue-300",
    in_progress: "bg-yellow-900/40 text-yellow-300",
    completed: "bg-green-900/40 text-green-300",
    cancelled: "bg-red-900/40 text-red-300",
  };
  const STATUS_LABELS: Record<string, string> = {
    scheduled: "예정", in_progress: "진행중", completed: "완료", cancelled: "취소",
  };

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">회의</h2>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
        >+ 회의 생성</button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-indigo-500/30 bg-gray-900/60 p-3 space-y-2">
          <input
            autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="회의 제목..."
            className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-500"
          />
          <div className="flex gap-2">
            <button onClick={create} className="flex-1 rounded-lg bg-indigo-600 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500">생성</button>
            <button onClick={() => { setShowCreate(false); setNewTitle(""); }} className="rounded-lg border border-white/10 px-3 py-1 text-xs text-gray-400">취소</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-xs text-gray-500">로딩 중...</p>
      ) : meetings.length === 0 ? (
        <p className="text-center text-xs text-gray-600 py-6">회의 없음</p>
      ) : (
        <div className="space-y-2">
          {meetings.map((m) => (
            <div key={m.id} className="rounded-xl border border-white/10 bg-gray-900/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-white text-sm">{m.title}</p>
                  {m.agenda && <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{m.agenda}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS_BADGES[m.status] ?? ""}`}>
                  {STATUS_LABELS[m.status] ?? m.status}
                </span>
              </div>
              {m.summary && (
                <div className="mt-2 rounded-lg bg-gray-800/60 p-2 text-xs text-gray-300">{m.summary}</div>
              )}
              <div className="mt-2 flex gap-1.5">
                {m.status === "scheduled" && (
                  <button onClick={() => updateStatus(m.id, "start")}
                    className="rounded-lg bg-yellow-900/40 px-2 py-1 text-xs text-yellow-300 hover:bg-yellow-900/60">▶ 시작</button>
                )}
                {m.status === "in_progress" && (
                  <button onClick={() => updateStatus(m.id, "complete")}
                    className="rounded-lg bg-green-900/40 px-2 py-1 text-xs text-green-300 hover:bg-green-900/60">✅ 완료</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

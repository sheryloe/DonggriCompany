"use client";

import { useState } from "react";
import { useOfficeData } from "../hooks/useOfficeData";
import Dashboard from "../components/Dashboard";

type TabKey = "dashboard" | "ops";

export default function OfficePage(): JSX.Element {
  const { agents, tasks, departments, stats, isLoading, error, refresh } = useOfficeData();
  const [tab, setTab] = useState<TabKey>("dashboard");

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
        <div className="text-center">
          <div className="mb-4 text-4xl animate-spin">⚙️</div>
          <p className="text-gray-400">Loading office data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
        <div className="text-center space-y-4">
          <p className="text-red-400">⚠️ {error}</p>
          <button
            onClick={refresh}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Tab bar */}
      <nav className="sticky top-0 z-10 flex gap-1 border-b border-white/10 bg-gray-950/90 px-4 backdrop-blur-sm">
        {(["dashboard", "ops"] as TabKey[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-semibold capitalize transition-colors ${
              tab === t
                ? "border-b-2 border-indigo-500 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {t === "dashboard" ? "📊 Dashboard" : "⚙️ Office Ops"}
          </button>
        ))}
      </nav>

      {tab === "dashboard" && (
        <Dashboard
          stats={stats}
          agents={agents}
          tasks={tasks}
          departments={departments}
          companyName="DonggriCompany"
        />
      )}

      {tab === "ops" && (
        <div className="p-4">
          {/* 기존 OfficePage 내용 (Account Pool / Runtime Profile / Probe 패널)은 여기 유지 */}
          <p className="text-gray-400 text-sm">기존 Ops 패널 (Account Pool, Runtime Profile, Probe) — 유지</p>
        </div>
      )}
    </main>
  );
}

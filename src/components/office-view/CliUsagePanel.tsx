import type { ReactNode } from "react";
import type { CliPoolUsageEntry, CliSessionUsageEntry, CliUsageEntry, CliUsageWindow } from "../../api";
import type { UiLanguage } from "../../i18n";
import type { CliStatusMap } from "../../types";
import { formatReset } from "./drawing-furniture-b";
import { LOCALE_TEXT } from "./themes-locale";

type TFunction = (messages: Record<UiLanguage, string>) => string;

interface CliUsagePanelProps {
  cliStatus: CliStatusMap | null;
  cliUsage: Record<string, CliUsageEntry> | null;
  cliPoolUsage: CliPoolUsageEntry[];
  cliSessionUsage: CliSessionUsageEntry[];
  language: UiLanguage;
  refreshing: boolean;
  onRefreshUsage: () => void;
  t: TFunction;
}

const ClaudeLogo = () => (
  <svg width="18" height="18" viewBox="0 0 400 400" fill="none">
    <path
      fill="#D97757"
      d="m124.011 241.251 49.164-27.585.826-2.396-.826-1.333h-2.396l-8.217-.506-28.09-.759-24.363-1.012-23.603-1.266-5.938-1.265L75 197.79l.574-3.661 4.994-3.358 7.153.625 15.808 1.079 23.722 1.637 17.208 1.012 25.493 2.649h4.049l.574-1.637-1.384-1.012-1.079-1.012-24.548-16.635-26.573-17.58-13.919-10.123-7.524-5.129-3.796-4.808-1.637-10.494 6.833-7.525 9.178.624 2.345.625 9.296 7.153 19.858 15.37 25.931 19.098 3.796 3.155 1.519-1.08.185-.759-1.704-2.851-14.104-25.493-15.049-25.931-6.698-10.747-1.772-6.445c-.624-2.649-1.08-4.876-1.08-7.592l7.778-10.561L144.729 75l10.376 1.383 4.37 3.797 6.445 14.745 10.443 23.215 16.197 31.566 4.741 9.364 2.53 8.672.945 2.649h1.637v-1.519l1.332-17.782 2.464-21.832 2.395-28.091.827-7.912 3.914-9.482 7.778-5.129 6.074 2.902 4.994 7.153-.692 4.623-2.969 19.301-5.821 30.234-3.796 20.245h2.21l2.531-2.53 10.241-13.599 17.208-21.511 7.593-8.537 8.857-9.431 5.686-4.488h10.747l7.912 11.76-3.543 12.147-11.067 14.037-9.178 11.895-13.16 17.714-8.216 14.172.759 1.131 1.957-.186 29.727-6.327 16.062-2.901 19.166-3.29 8.672 4.049.944 4.116-3.408 8.419-20.498 5.062-24.042 4.808-35.801 8.469-.439.321.506.624 16.13 1.519 6.9.371h16.888l31.448 2.345 8.217 5.433 4.926 6.647-.827 5.061-12.653 6.445-17.074-4.049-39.85-9.482-13.666-3.408h-1.889v1.131l11.388 11.135 20.87 18.845 26.133 24.295 1.333 6.006-3.357 4.741-3.543-.506-22.962-17.277-8.858-7.777-20.06-16.888H238.5v1.771l4.623 6.765 24.413 36.696 1.265 11.253-1.771 3.661-6.327 2.21-6.951-1.265-14.29-20.06-14.745-22.591-11.895-20.246-1.451.827-7.018 75.601-3.29 3.863-7.592 2.902-6.327-4.808-3.357-7.778 3.357-15.37 4.049-20.06 3.29-15.943 2.969-19.807 1.772-6.58-.118-.439-1.451.186-14.931 20.498-22.709 30.689-17.968 19.234-4.302 1.704-7.458-3.864.692-6.9 4.167-6.141 24.869-31.634 14.999-19.605 9.684-11.32-.068-1.637h-.573l-66.052 42.887-11.759 1.519-5.062-4.741.625-7.778 2.395-2.531 19.858-13.665-.068.067z"
    />
  </svg>
);

const ChatGPTLogo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path
      d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 0011.708.413a6.12 6.12 0 00-5.834 4.27 5.984 5.984 0 00-3.996 2.9 6.043 6.043 0 00.743 7.097 5.98 5.98 0 00.51 4.911 6.051 6.051 0 006.515 2.9A5.985 5.985 0 0013.192 24a6.116 6.116 0 005.84-4.27 5.99 5.99 0 003.997-2.9 6.056 6.056 0 00-.747-7.01zM13.192 22.784a4.474 4.474 0 01-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 00.392-.681v-6.737l2.02 1.168a.071.071 0 01.038.052v5.583a4.504 4.504 0 01-4.494 4.494zM3.658 18.607a4.47 4.47 0 01-.535-3.014l.142.085 4.783 2.759a.77.77 0 00.78 0l5.843-3.369v2.332a.08.08 0 01-.033.062L9.74 20.236a4.508 4.508 0 01-6.083-1.63zM2.328 7.847A4.477 4.477 0 014.68 5.879l-.002.159v5.52a.78.78 0 00.391.676l5.84 3.37-2.02 1.166a.08.08 0 01-.073.007L3.917 13.98a4.506 4.506 0 01-1.589-6.132zM19.835 11.94l-5.844-3.37 2.02-1.166a.08.08 0 01.073-.007l4.898 2.794a4.494 4.494 0 01-.69 8.109v-5.68a.79.79 0 00-.457-.68zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 00-.785 0L10.302 9.42V7.088a.08.08 0 01.033-.062l4.898-2.824a4.497 4.497 0 016.612 4.66v.054zM9.076 12.59l-2.02-1.164a.08.08 0 01-.038-.057V5.79A4.498 4.498 0 0114.392 3.2l-.141.08-4.778 2.758a.795.795 0 00-.392.681l-.005 5.87zm1.098-2.358L12 9.019l1.826 1.054v2.109L12 13.235l-1.826-1.054v-2.108z"
      fill="#10A37F"
    />
  </svg>
);

const GeminiLogo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.373 12 12 0-6.627 5.373-12 12-12-6.627 0-12-5.373-12-12z"
      fill="url(#gemini_grad)"
    />
    <defs>
      <linearGradient id="gemini_grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop stopColor="#4285F4" />
        <stop offset="1" stopColor="#886FBF" />
      </linearGradient>
    </defs>
  </svg>
);

const CLI_DISPLAY: Array<{ key: string; name: string; icon: ReactNode; color: string; bgColor: string }> = [
  {
    key: "claude",
    name: "Claude",
    icon: <ClaudeLogo />,
    color: "text-violet-300",
    bgColor: "bg-violet-500/15 border-violet-400/30",
  },
  {
    key: "codex",
    name: "Codex",
    icon: <ChatGPTLogo />,
    color: "text-emerald-300",
    bgColor: "bg-emerald-500/15 border-emerald-400/30",
  },
  {
    key: "gemini",
    name: "Gemini",
    icon: <GeminiLogo />,
    color: "text-blue-300",
    bgColor: "bg-blue-500/15 border-blue-400/30",
  },
  {
    key: "jules",
    name: "Jules",
    icon: "J",
    color: "text-cyan-300",
    bgColor: "bg-cyan-500/15 border-cyan-400/30",
  },
  {
    key: "copilot",
    name: "Copilot",
    icon: "🚀",
    color: "text-amber-300",
    bgColor: "bg-amber-500/15 border-amber-400/30",
  },
  {
    key: "antigravity",
    name: "Antigravity",
    icon: "🌌",
    color: "text-pink-300",
    bgColor: "bg-pink-500/15 border-pink-400/30",
  },
];

type CliCardItem = {
  key: string;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  color: string;
  bgColor: string;
  usage?: CliUsageEntry;
  sessionUsage?: CliSessionUsageEntry;
  statusAuthenticated?: boolean;
};

type RankedCliCardItem = CliCardItem & {
  windows: CliUsageWindow[];
  signedIn: boolean;
  inUse: boolean;
  maxUtilization: number;
  hasUsageData: boolean;
  sessionActivityScore: number;
};

function sortUsageWindows(windows: CliUsageWindow[]): CliUsageWindow[] {
  return [...windows].sort((a, b) => b.utilization - a.utilization || a.label.localeCompare(b.label));
}

function buildRankedCard(card: CliCardItem): RankedCliCardItem {
  const windows = sortUsageWindows(card.usage?.windows ?? []);
  const sessionCounts = card.sessionUsage?.sessions;
  const sessionActivityScore = (sessionCounts?.in_progress ?? 0) * 1000 + (sessionCounts?.awaiting ?? 0) * 100;
  const maxUtilization = windows.length > 0 ? Math.max(...windows.map((windowEntry) => windowEntry.utilization)) : 0;
  const signedIn =
    (card.usage?.error ?? card.sessionUsage?.error) === "unauthenticated"
      ? false
      : typeof card.statusAuthenticated === "boolean"
        ? card.statusAuthenticated
        : Boolean((card.usage && !card.usage.error) || (card.sessionUsage && !card.sessionUsage.error));
  const inUse = maxUtilization > 0 || (sessionCounts?.in_progress ?? 0) > 0 || (sessionCounts?.awaiting ?? 0) > 0;
  return {
    ...card,
    windows,
    signedIn,
    inUse,
    maxUtilization,
    hasUsageData: windows.length > 0 || (sessionCounts?.total ?? 0) > 0,
    sessionActivityScore,
  };
}

function compareRankedCard(a: RankedCliCardItem, b: RankedCliCardItem): number {
  if (a.inUse !== b.inUse) return Number(b.inUse) - Number(a.inUse);
  if (a.signedIn !== b.signedIn) return Number(b.signedIn) - Number(a.signedIn);
  if (a.hasUsageData !== b.hasUsageData) return Number(b.hasUsageData) - Number(a.hasUsageData);
  if (a.sessionActivityScore !== b.sessionActivityScore) return b.sessionActivityScore - a.sessionActivityScore;
  if (a.maxUtilization !== b.maxUtilization) return b.maxUtilization - a.maxUtilization;
  return a.title.localeCompare(b.title) || a.key.localeCompare(b.key);
}

export default function CliUsagePanel({
  cliStatus,
  cliUsage,
  cliPoolUsage,
  cliSessionUsage,
  language,
  refreshing,
  onRefreshUsage,
  t,
}: CliUsagePanelProps) {
  const poolProviders = new Set(
    [...cliPoolUsage, ...cliSessionUsage]
      .map((pool) => String(pool.provider || "").trim())
      .filter((provider): provider is string => provider.length > 0),
  );
  const providerCards = CLI_DISPLAY.flatMap((cli): CliCardItem[] => {
    if (poolProviders.has(cli.key)) return [];
    const status = cliStatus?.[cli.key as keyof CliStatusMap];
    const usage = cliUsage?.[cli.key];
    if (!(status?.installed || usage)) return [];
    return [
      {
        key: cli.key,
        title: cli.name,
        icon: cli.icon,
        color: cli.color,
        bgColor: cli.bgColor,
        usage,
        statusAuthenticated: status?.authenticated,
      },
    ];
  });
  const poolCards: CliCardItem[] = cliPoolUsage.map((pool) => {
    const display = CLI_DISPLAY.find((cli) => cli.key === pool.provider);
    const baseLabel = String(pool.label || pool.accountPoolId).trim() || pool.accountPoolId;
    const displayLabel = baseLabel === pool.accountPoolId ? baseLabel : `${baseLabel} (${pool.accountPoolId})`;
    return {
      key: pool.key,
      title:
        display?.name ??
        String(pool.provider || "CLI")
          .trim()
          .replace(/^\w/, (char) => char.toUpperCase()),
      subtitle: displayLabel,
      icon: display?.icon ?? <ChatGPTLogo />,
      color: display?.color ?? "text-slate-300",
      bgColor: display?.bgColor ?? "bg-slate-700/30 border-slate-500/40",
      usage: pool.usage,
      statusAuthenticated: pool.usage.error !== "unauthenticated",
    };
  });

  const sessionCards: CliCardItem[] = cliSessionUsage.map((session) => {
    const display = CLI_DISPLAY.find((cli) => cli.key === session.provider);
    const baseLabel = String(session.label || session.accountPoolId).trim() || session.accountPoolId;
    const displayLabel = baseLabel === session.accountPoolId ? baseLabel : `${baseLabel} (${session.accountPoolId})`;
    return {
      key: `${session.key}:session`,
      title:
        display?.name ??
        String(session.provider || "CLI")
          .trim()
          .replace(/^\w/, (char) => char.toUpperCase()),
      subtitle: displayLabel,
      icon: display?.icon ?? "J",
      color: display?.color ?? "text-slate-300",
      bgColor: display?.bgColor ?? "bg-slate-700/30 border-slate-500/40",
      sessionUsage: session,
      statusAuthenticated: session.error !== "unauthenticated",
    };
  });

  const rankedCards = [...providerCards, ...poolCards, ...sessionCards].map(buildRankedCard).sort(compareRankedCard);
  const totalConnected = rankedCards.length;

  if (totalConnected === 0) return null;

  return (
    <div className="mt-3 px-2">
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/80 p-3 backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-cyan-500/20">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="text-cyan-400"
              >
                <path d="M12 2a10 10 0 1 0 10 10" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.3" />
                <path d="M12 6v6l4 2" />
              </svg>
            </span>
            {t(LOCALE_TEXT.cliUsageTitle)}
          </h3>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[9px] text-slate-400">
              {totalConnected} {t(LOCALE_TEXT.cliConnected)}
            </span>
            <button
              onClick={onRefreshUsage}
              disabled={refreshing}
              className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200 disabled:opacity-50"
              title={t(LOCALE_TEXT.cliRefreshTitle)}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={refreshing ? "animate-spin" : ""}
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </button>
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rankedCards.map((card) => {
            const usage = card.usage;
            const sessionUsage = card.sessionUsage;
            const errorCode = usage?.error ?? sessionUsage?.error ?? null;
            const statusDotClass = card.inUse ? "bg-emerald-400" : card.signedIn ? "bg-cyan-400" : "bg-slate-500";
            return (
              <div
                key={card.key}
                className={`group min-w-0 rounded-lg border ${card.bgColor} p-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg`}
              >
                <div className="mb-1.5 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="mt-0.5 flex h-[16px] w-[16px] items-center justify-center text-sm">
                      {card.icon}
                    </span>
                    <div className="min-w-0">
                      <div className={`truncate text-xs font-semibold ${card.color}`}>{card.title}</div>
                      {card.subtitle && (
                        <div className="break-all text-[9px] leading-tight text-slate-400">{card.subtitle}</div>
                      )}
                    </div>
                  </div>
                  <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${statusDotClass}`} />
                </div>

                {errorCode === "unauthenticated" && (
                  <p className="text-[10px] text-slate-500 italic">{t(LOCALE_TEXT.cliNotSignedIn)}</p>
                )}
                {errorCode === "not_implemented" && (
                  <p className="text-[10px] text-slate-500 italic">{t(LOCALE_TEXT.cliNoApi)}</p>
                )}
                {errorCode && errorCode !== "unauthenticated" && errorCode !== "not_implemented" && (
                  <p className="text-[10px] text-slate-500 italic">{t(LOCALE_TEXT.cliUnavailable)}</p>
                )}

                {!usage && !sessionUsage && (
                  <p className="text-[10px] text-slate-500 italic">{t(LOCALE_TEXT.cliLoading)}</p>
                )}

                {usage && !usage.error && card.windows.length > 0 && (
                  <div className="space-y-1.5">
                    {card.windows.map((windowEntry: CliUsageWindow) => {
                      const percentage = Math.round(windowEntry.utilization * 100);
                      const barColor =
                        percentage >= 80 ? "bg-red-500" : percentage >= 50 ? "bg-amber-400" : "bg-emerald-400";
                      const resetText = windowEntry.resetsAt
                        ? `${t(LOCALE_TEXT.cliResets)} ${formatReset(windowEntry.resetsAt, language)}`
                        : "";
                      return (
                        <div key={windowEntry.label}>
                          <div className="mb-0.5 flex min-w-0 items-center justify-between gap-2 text-[9px]">
                            <span className="min-w-0 truncate text-slate-400">{windowEntry.label}</span>
                            <span title={resetText || undefined} className="flex items-center gap-1">
                              <span
                                className={
                                  percentage >= 80
                                    ? "font-semibold text-red-400"
                                    : percentage >= 50
                                      ? "text-amber-400"
                                      : "text-slate-400"
                                }
                              >
                                {percentage}%
                              </span>
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-700/60">
                            <div
                              className={`h-full rounded-full ${barColor} transition-all duration-700`}
                              style={{ width: `${Math.min(100, percentage)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {usage && !usage.error && usage.windows.length === 0 && (
                  <p className="text-[10px] text-slate-500 italic">{t(LOCALE_TEXT.cliNoData)}</p>
                )}

                {sessionUsage && !sessionUsage.error && (
                  <div className="space-y-1 text-[9px] text-slate-300">
                    <div className="flex items-center justify-between">
                      <span>{language === "ko" ? "진행 중" : "In Progress"}</span>
                      <span className="font-semibold text-emerald-300">{sessionUsage.sessions.in_progress}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{language === "ko" ? "대기" : "Awaiting"}</span>
                      <span className="font-semibold text-amber-300">{sessionUsage.sessions.awaiting}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{language === "ko" ? "완료" : "Completed"}</span>
                      <span className="text-cyan-300">{sessionUsage.sessions.completed}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{language === "ko" ? "실패" : "Failed"}</span>
                      <span className="text-rose-300">{sessionUsage.sessions.failed}</span>
                    </div>
                    {sessionUsage.lastActive && (
                      <div className="break-all text-[8px] text-slate-500">
                        {language === "ko" ? "마지막 활동" : "Last active"}:{" "}
                        {formatReset(sessionUsage.lastActive, language)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

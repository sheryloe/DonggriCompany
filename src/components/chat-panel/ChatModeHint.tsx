type ChatMode = "chat" | "task" | "announcement" | "report";

type Tr = (ko: string, en: string, ja?: string, zh?: string) => string;

interface ChatModeHintProps {
  mode: ChatMode;
  isDirectiveMode: boolean;
  isPrnCommandMode: boolean;
  tr: Tr;
}

export default function ChatModeHint({ mode, isDirectiveMode, isPrnCommandMode, tr }: ChatModeHintProps) {
  if (mode === "chat" && !isDirectiveMode && !isPrnCommandMode) return null;

  return (
    <div className="flex-shrink-0 px-4 py-1">
      {isDirectiveMode ? (
        <p className="text-xs font-medium text-red-400">
          {tr(
            "Directive 모드: 기획 리더 파이프라인이 자동 시작됩니다.",
            "Directive mode: Planning leader pipeline starts automatically.",
            "Directive モード: Planning leader pipeline が自動開始されます。",
            "Directive 模式：规划负责人流程将自动启动。",
          )}
        </p>
      ) : isPrnCommandMode ? (
        <p className="text-xs font-medium text-indigo-300">
          {tr(
            "/prn 명령: PRN 초안을 생성하고 검토 후 directive로 전환합니다.",
            "/prn command: generate a PRN draft, review it, then convert to directive.",
            "/prn コマンド: PRN 下書きを生成し、確認後に directive へ変換します。",
            "/prn 命令：先生成 PRN 草案，审阅后再转换为 directive。",
          )}
        </p>
      ) : (
        <>
          {mode === "task" && (
            <p className="text-xs text-blue-400">
              {tr(
                "작업 모드: 선택한 에이전트에게 작업 지시를 전달합니다.",
                "Task mode: send work instructions to the selected agent.",
                "タスクモード: 選択したエージェントに作業指示を送ります。",
                "任务模式：向已选择的代理发送任务指令。",
              )}
            </p>
          )}
          {mode === "announcement" && (
            <p className="text-xs text-yellow-400">
              {tr(
                "공지 모드: 전체 에이전트에게 브로드캐스트합니다.",
                "Announcement mode: broadcast to all agents.",
                "告知モード: すべてのエージェントへブロードキャストします。",
                "公告模式：向全部代理广播。",
              )}
            </p>
          )}
          {mode === "report" && (
            <p className="text-xs text-emerald-400">
              {tr(
                "보고 모드: 보고서/발표 초안을 요청합니다.",
                "Report mode: request a report or presentation draft.",
                "レポートモード: レポート/発表下書きを依頼します。",
                "报告模式：请求报告或演示稿草案。",
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}

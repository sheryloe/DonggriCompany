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
            "Directive 모드: 기획팀이 자동으로 팀장 파이프라인을 시작합니다.",
            "Directive mode: Planning leader pipeline starts automatically.",
            "Directiveモード: 企画チームが自動でチームリーダーパイプラインを開始します。",
            "Directive 模式：企划组自动启动组长流水线。",
          )}
        </p>
      ) : isPrnCommandMode ? (
        <p className="text-xs font-medium text-indigo-300">
          {tr(
            "/prn 명령: 요구사항(PRN) 초안을 생성한 뒤 대표 검토 후 지시로 전환합니다.",
            "/prn command: generate a PRN draft, review it, then convert to directive.",
            "/prn コマンド: PRN草案を生成し、確認後に指示へ変換します。",
            "/prn 命令：先生成 PRN 草案，确认后再转为指令。",
          )}
        </p>
      ) : (
        <>
          {mode === "task" && (
            <p className="text-xs text-blue-400">
              {tr(
                "업무 지시 모드: 선택한 에이전트에게 태스크를 전달합니다.",
                "Task mode: send work instructions to the selected agent.",
                "タスクモード: 選択したエージェントに指示を送信します。",
                "任务模式：向所选代理发送任务指令。",
              )}
            </p>
          )}
          {mode === "announcement" && (
            <p className="text-xs text-yellow-400">
              {tr(
                "공지 모드: 전체 에이전트에게 브로드캐스트됩니다.",
                "Announcement mode: broadcast to all agents.",
                "告知モード: 全エージェントへ配信されます。",
                "公告模式：广播给所有代理。",
              )}
            </p>
          )}
          {mode === "report" && (
            <p className="text-xs text-emerald-400">
              {tr(
                "보고 요청 모드: 보고서/발표 자료 작성을 요청합니다.",
                "Report mode: request a report or presentation draft.",
                "レポートモード: レポート/資料作成を依頼します。",
                "报告模式：请求生成报告或汇报材料。",
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}


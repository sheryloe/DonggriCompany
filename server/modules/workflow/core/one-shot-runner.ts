import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AgentRow, OneShotRunOptions, OneShotRunResult } from "./conversation-types.ts";
import { resolveCliAccountPoolEnv, resolveDefaultCliAccountProfileRoot } from "../agents/cli-account-pool-env.ts";
import {
  buildMinimalCliChildEnv,
  isProviderLiveExecutionApproved,
  PROVIDER_LIVE_EXECUTION_GATE_ID,
  type ProviderLiveExecutionGate,
} from "../agents/cli-runtime.ts";
import { resolveHostExecutable, type ResolveHostExecutableInput } from "../agents/host-executable-resolver.ts";
import { resolveProviderRuntimeKind } from "../agents/provider-runtime-kind.ts";
import { resolveProviderExecutionPolicy } from "../agents/provider-policy-resolver.ts";
import { previewCanonicalRouting } from "../../company/canonical-policy.ts";

type CreateOneShotRunnerDeps = {
  db: any;
  logsDir: string;
  broadcast: (event: string, payload: unknown) => void;
  getProviderModelConfig: () => Record<
    string,
    {
      model?: string;
      subModel?: string;
      reasoningLevel?: string;
      subModelReasoningLevel?: string;
    }
  >;
  executeApiProviderAgent: (...args: any[]) => Promise<void>;
  executeCopilotAgent: (...args: any[]) => Promise<void>;
  executeAntigravityAgent: (...args: any[]) => Promise<void>;
  killPidTree: (pid: number) => void;
  prettyStreamJson: (raw: string) => string;
  getPreferredLanguage: () => string;
  normalizeStreamChunk: (raw: Buffer | string, opts?: { dropCliNoise?: boolean }) => string;
  hasStructuredJsonLines: (raw: string) => boolean;
  normalizeConversationReply: (raw: string, maxChars?: number, opts?: { maxSentences?: number }) => string;
  buildAgentArgs: (provider: string, model?: string, reasoningLevel?: string, opts?: { noTools?: boolean }) => string[];
  withCliPathFallback: (pathValue: string | undefined) => string;
  spawnProcess?: typeof spawn;
  providerLiveExecutionGate?: ProviderLiveExecutionGate;
  resolveExecutable?: (input: ResolveHostExecutableInput) => ReturnType<typeof resolveHostExecutable>;
  terminationAckTimeoutMs?: number;
  cliAccountProfileRoot?: string;
};

export function createOneShotRunner(deps: CreateOneShotRunnerDeps) {
  const {
    db,
    logsDir,
    broadcast,
    getProviderModelConfig,
    executeApiProviderAgent,
    executeCopilotAgent,
    executeAntigravityAgent,
    killPidTree,
    prettyStreamJson,
    getPreferredLanguage,
    normalizeStreamChunk,
    hasStructuredJsonLines,
    normalizeConversationReply,
    buildAgentArgs,
    withCliPathFallback,
    spawnProcess = spawn,
    providerLiveExecutionGate,
    resolveExecutable = resolveHostExecutable,
    terminationAckTimeoutMs = 1_500,
    cliAccountProfileRoot = resolveDefaultCliAccountProfileRoot(),
  } = deps;
  const NO_TOOLS_POLICY_ERROR = "tool_use_blocked_by_no_tools_policy";
  const JULES_ONE_SHOT_UNSUPPORTED_ERROR = "jules_not_supported_for_one_shot";
  const CLI_TOOL_SIGNAL_REGEX =
    /"type"\s*:\s*"(?:tool_use|tool_result|command_execution|function_call|tool_call|mcp_tool_call)"|"tool_use_id"\s*:|"toolName"\s*:/i;
  const unconfirmedTerminationHandles = new Set<ReturnType<typeof spawn>>();

  function hasCliToolSignal(text: string): boolean {
    return CLI_TOOL_SIGNAL_REGEX.test(text);
  }

  function createSafeLogStreamOps(logStream: any): {
    safeWrite: (text: string) => boolean;
    safeEnd: (onDone?: () => void) => void;
    isClosed: () => boolean;
  } {
    let ended = false;
    const isClosed = () => ended || Boolean(logStream?.destroyed || logStream?.writableEnded || logStream?.closed);
    const safeWrite = (text: string): boolean => {
      if (!text || isClosed()) return false;
      try {
        logStream.write(text);
        return true;
      } catch {
        ended = true;
        return false;
      }
    };
    const safeEnd = (onDone?: () => void): void => {
      if (isClosed()) {
        ended = true;
        onDone?.();
        return;
      }
      ended = true;
      try {
        logStream.end(() => onDone?.());
      } catch {
        onDone?.();
      }
    };
    return { safeWrite, safeEnd, isClosed };
  }

  async function runAgentOneShot(
    agent: AgentRow,
    prompt: string,
    opts: OneShotRunOptions = {},
  ): Promise<OneShotRunResult> {
    const requestedProvider = agent.cli_provider || "claude";
    const requestedRuntimeKind = resolveProviderRuntimeKind(requestedProvider);
    if (!requestedRuntimeKind) {
      return { text: "", error: `unsupported_provider:${requestedProvider}` };
    }
    const julesOneShotFallback = requestedRuntimeKind === "async_session";
    const provider = julesOneShotFallback ? "gemini" : requestedProvider;
    const timeoutMs = opts.timeoutMs ?? 180_000;
    const projectPath = opts.projectPath || process.cwd();
    const streamTaskId = opts.streamTaskId ?? null;
    const noTools = opts.noTools === true;
    const runId = `meeting-${agent.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const logPath = path.join(logsDir, `${runId}.log`);
    const logStream = fs.createWriteStream(logPath, { flags: "w" });
    const { safeWrite, safeEnd } = createSafeLogStreamOps(logStream);
    let rawOutput = "";
    let exitCode = 0;
    let activeChild: any = null;
    let activeStdoutListener: ((chunk: Buffer) => void) | null = null;
    let activeStderrListener: ((chunk: Buffer) => void) | null = null;
    let activeErrorListener: ((err: Error) => void) | null = null;
    let activeCloseListener: ((code: number | null) => void) | null = null;
    let abortActiveRun: ((reason: string) => void) | null = null;
    let noToolsViolationDetected = false;
    const detachChildListeners = () => {
      const child = activeChild;
      if (!child) return;
      if (activeStdoutListener) {
        child.stdout?.off("data", activeStdoutListener);
        activeStdoutListener = null;
      }
      if (activeStderrListener) {
        child.stderr?.off("data", activeStderrListener);
        activeStderrListener = null;
      }
      if (activeErrorListener) {
        child.off("error", activeErrorListener);
        activeErrorListener = null;
      }
      if (activeCloseListener) {
        child.off("close", activeCloseListener);
        activeCloseListener = null;
      }
      activeChild = null;
    };

    const onChunk = (chunk: Buffer | string, stream: "stdout" | "stderr") => {
      const text = normalizeStreamChunk(chunk, {
        dropCliNoise: provider !== "copilot" && provider !== "antigravity" && provider !== "api",
      });
      if (!text) return;
      rawOutput += text;
      safeWrite(text);
      if (streamTaskId) broadcast("cli_output", { task_id: streamTaskId, stream, data: text });
      if (noTools && !noToolsViolationDetected && hasCliToolSignal(text)) {
        noToolsViolationDetected = true;
        abortActiveRun?.(NO_TOOLS_POLICY_ERROR);
      }
    };

    try {
      if (julesOneShotFallback) {
        safeWrite(
          `[one-shot] provider=jules is task-only(async_session). Falling back to provider=${provider} for direct reply.\n`,
        );
      }
      if (provider === "api") {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          await executeApiProviderAgent(
            prompt,
            projectPath,
            logStream,
            controller.signal,
            streamTaskId ?? undefined,
            (agent as any).api_provider_id ?? null,
            (agent as any).api_model ?? null,
            (text: string) => {
              rawOutput += text;
              return safeWrite(text);
            },
          );
        } finally {
          clearTimeout(timeout);
        }
        if (!rawOutput.trim() && fs.existsSync(logPath)) rawOutput = fs.readFileSync(logPath, "utf8");
      } else if (provider === "copilot" || provider === "antigravity") {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const oauthWrite = (text: string) => {
          rawOutput += text;
          return safeWrite(text);
        };
        try {
          if (provider === "copilot") {
            await executeCopilotAgent(
              prompt,
              projectPath,
              logStream,
              controller.signal,
              streamTaskId ?? undefined,
              agent.oauth_account_id ?? null,
              oauthWrite,
            );
          } else {
            await executeAntigravityAgent(
              prompt,
              logStream,
              controller.signal,
              streamTaskId ?? undefined,
              agent.oauth_account_id ?? null,
              oauthWrite,
            );
          }
        } finally {
          clearTimeout(timeout);
        }
        if (!rawOutput.trim() && fs.existsSync(logPath)) rawOutput = fs.readFileSync(logPath, "utf8");
      } else {
        const poolEnv = resolveCliAccountPoolEnv({
          db,
          provider,
          cliAccountPoolId: julesOneShotFallback ? null : ((agent as any).cli_account_pool_id ?? null),
          platform: process.platform,
          selectionSeed: runId,
          profileRoot: cliAccountProfileRoot,
        });
        if (!poolEnv.ok) {
          if (julesOneShotFallback) {
            throw new Error(`${JULES_ONE_SHOT_UNSUPPORTED_ERROR}:${poolEnv.reason}`);
          }
          throw new Error(`cli account pool error: ${poolEnv.reason}`);
        }
        const canonicalExecutionPolicy = previewCanonicalRouting({
          text: prompt,
          projectPath,
          providerModelConfig: getProviderModelConfig(),
          defaultProvider: provider,
        });
        const executionPolicy = resolveProviderExecutionPolicy({
          provider,
          providerModelConfig: getProviderModelConfig(),
          canonicalOverride: canonicalExecutionPolicy,
        });
        const model = executionPolicy.model;
        const reasoningLevel = executionPolicy.reasoningLevel;
        const args = buildAgentArgs(provider, model, reasoningLevel, { noTools });

        const cleanEnv = buildMinimalCliChildEnv(process.env, process.platform);
        cleanEnv.PATH = withCliPathFallback(String(cleanEnv.PATH ?? process.env.PATH ?? ""));
        Object.assign(cleanEnv, poolEnv.envPatch);
        const effectiveHome = String(cleanEnv.HOME ?? "").trim();
        safeWrite(
          `[one-shot] CLI account env: provider=${provider} pool=${poolEnv.poolId ?? "default"} selected_by=${poolEnv.selectedBy} home=${effectiveHome || "(empty)"}\n`,
        );
        const executable = resolveExecutable({
          command: args[0],
          argv: args.slice(1),
          pathValue: cleanEnv.PATH,
          platform: process.platform,
          allowedCommands: [provider],
        });
        if (!executable.ok) throw new Error(`host executable error: ${executable.reason}`);
        if (
          !isProviderLiveExecutionApproved(providerLiveExecutionGate, {
            operation: "one_shot_run",
            runId,
            taskId: streamTaskId ?? runId,
            provider,
            poolId: poolEnv.poolId,
            projectPath: path.resolve(projectPath),
            executable: executable.executable,
          })
        ) {
          throw new Error(`provider live execution approval required: ${PROVIDER_LIVE_EXECUTION_GATE_ID}`);
        }
        safeWrite(
          `[one-shot] Host executable: source=${executable.source} command=${executable.commandPath} shell=false\n`,
        );

        await new Promise<void>((resolve, reject) => {
          const child = spawnProcess(executable.executable, executable.argv, {
            cwd: projectPath,
            env: cleanEnv,
            shell: false,
            stdio: ["pipe", "pipe", "pipe"],
            detached: false,
            windowsHide: true,
          });
          activeChild = child;
          let settled = false;
          let abortReason: string | null = null;
          let terminationAckTimer: ReturnType<typeof setTimeout> | null = null;
          let timeout: ReturnType<typeof setTimeout> | null = null;
          const settle = (callback: () => void) => {
            if (settled) return;
            settled = true;
            if (timeout) clearTimeout(timeout);
            if (terminationAckTimer) clearTimeout(terminationAckTimer);
            abortActiveRun = null;
            detachChildListeners();
            callback();
          };
          const abortRun = (reason: string) => {
            if (settled || abortReason) return;
            abortReason = reason;
            const pid = child.pid ?? 0;
            try {
              if (pid > 0) killPidTree(pid);
              else child.kill?.("SIGTERM");
            } catch {
              // Wait for a close acknowledgement even when the first kill path races.
            }
            terminationAckTimer = setTimeout(
              () => {
                unconfirmedTerminationHandles.add(child);
                child.once("close", () => unconfirmedTerminationHandles.delete(child));
                settle(() => reject(new Error(`${reason}: termination_unconfirmed`)));
              },
              Math.max(25, Math.trunc(terminationAckTimeoutMs)),
            );
          };
          abortActiveRun = abortRun;

          timeout = setTimeout(() => {
            abortRun(`timeout after ${timeoutMs}ms`);
          }, timeoutMs);

          activeErrorListener = (err: Error) => {
            settle(() => reject(err));
          };
          activeStdoutListener = (chunk: Buffer) => onChunk(chunk, "stdout");
          activeStderrListener = (chunk: Buffer) => onChunk(chunk, "stderr");
          activeCloseListener = (code: number | null) => {
            exitCode = code ?? 1;
            if (abortReason) settle(() => reject(new Error(abortReason!)));
            else settle(() => resolve());
          };
          child.on("error", activeErrorListener);
          child.stdout?.on("data", activeStdoutListener);
          child.stderr?.on("data", activeStderrListener);
          child.on("close", activeCloseListener);

          child.stdin?.write(prompt);
          child.stdin?.end();
        });
      }
    } catch (err: any) {
      const message = err?.message ? String(err.message) : String(err);
      if (message.startsWith(`${JULES_ONE_SHOT_UNSUPPORTED_ERROR}:`)) {
        return { text: "", error: JULES_ONE_SHOT_UNSUPPORTED_ERROR };
      }
      if (julesOneShotFallback && /spawn .* ENOENT|unsupported CLI provider|unsupported_provider/i.test(message)) {
        return { text: "", error: JULES_ONE_SHOT_UNSUPPORTED_ERROR };
      }
      if (message === NO_TOOLS_POLICY_ERROR) {
        if (opts.rawOutput) {
          const raw = rawOutput.trim();
          if (raw) return { text: raw, error: NO_TOOLS_POLICY_ERROR };
          const pretty = prettyStreamJson(rawOutput).trim();
          if (pretty) return { text: pretty, error: NO_TOOLS_POLICY_ERROR };
          return { text: "", error: NO_TOOLS_POLICY_ERROR };
        }
        const partial = normalizeConversationReply(rawOutput, 320);
        if (partial) return { text: partial, error: NO_TOOLS_POLICY_ERROR };
        const pretty = prettyStreamJson(rawOutput);
        const roughSource = pretty.trim() || hasStructuredJsonLines(rawOutput) ? pretty : rawOutput;
        const rough = roughSource.replace(/\s+/g, " ").trim();
        if (rough) {
          const clipped = rough.length > 320 ? `${rough.slice(0, 319).trimEnd()}…` : rough;
          return { text: clipped, error: NO_TOOLS_POLICY_ERROR };
        }
        return { text: "", error: NO_TOOLS_POLICY_ERROR };
      }
      onChunk(`\n[one-shot-error] ${message}\n`, "stderr");
      if (opts.rawOutput) {
        const raw = rawOutput.trim();
        if (raw) return { text: raw, error: message };
        const pretty = prettyStreamJson(rawOutput).trim();
        if (pretty) return { text: pretty, error: message };
        return { text: "", error: message };
      }
      const partial = normalizeConversationReply(rawOutput, 320);
      if (partial) return { text: partial, error: message };
      const pretty = prettyStreamJson(rawOutput);
      const roughSource = pretty.trim() || hasStructuredJsonLines(rawOutput) ? pretty : rawOutput;
      const rough = roughSource.replace(/\s+/g, " ").trim();
      if (rough) {
        const clipped = rough.length > 320 ? `${rough.slice(0, 319).trimEnd()}…` : rough;
        return { text: clipped, error: message };
      }
      return { text: "", error: message };
    } finally {
      abortActiveRun = null;
      detachChildListeners();
      await new Promise<void>((resolve) => safeEnd(resolve));
    }

    if (exitCode !== 0) {
      const error = `${provider} exited with code ${exitCode}`;
      if (opts.rawOutput) return { text: rawOutput.trim(), error };
      return { text: normalizeConversationReply(rawOutput), error };
    }

    if (opts.rawOutput) {
      const pretty = prettyStreamJson(rawOutput).trim();
      const raw = rawOutput.trim();
      return { text: pretty || raw };
    }

    const normalized = normalizeConversationReply(rawOutput);
    if (normalized) return { text: normalized };

    const pretty = prettyStreamJson(rawOutput);
    const roughSource = pretty.trim() || hasStructuredJsonLines(rawOutput) ? pretty : rawOutput;
    const rough = roughSource.replace(/\s+/g, " ").trim();
    if (rough) {
      const clipped = rough.length > 320 ? `${rough.slice(0, 319).trimEnd()}…` : rough;
      return { text: clipped };
    }

    const lang = getPreferredLanguage();
    if (lang === "en") return { text: "Acknowledged. Continuing to the next step." };
    if (lang === "ja") return { text: "確認しました。次のステップへ進みます。" };
    if (lang === "zh") return { text: "已确认，继续进入下一步。" };
    return { text: "확인했습니다. 다음 단계로 진행하겠습니다." };
  }

  return {
    runAgentOneShot,
    getUnconfirmedTerminationCount: () => unconfirmedTerminationHandles.size,
  };
}

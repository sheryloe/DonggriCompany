import { useEffect, useMemo, useRef, useState } from "react";
import {
  decideDurableImageArtifact,
  exportDurableImageArtifact,
  handoffDurableImageArtifact,
  readDurableImageProject,
  recordDurableImagePartialFailure,
  registerDurableImageArtifact,
  type DurableImageArtifact,
} from "../../api/image-workbench";
import {
  buildImageArtifactMetadata,
  canExportImageVersion,
  deriveImageVersion,
  derivePartialImageVersion,
  restoreImageVersion,
  type ImageWorkbenchOperation,
  type ImageWorkbenchVersion,
} from "./model";

interface ImageWorkbenchPanelProps {
  projectId: string;
  projectName: string;
  generationDraftEnabled: boolean;
  onCreateGenerationDraft: () => Promise<void>;
}

type SupportedMime = ImageWorkbenchVersion["mimeType"];

const operationLabels: Record<ImageWorkbenchOperation, string> = {
  input: "입력",
  generate: "생성",
  edit: "편집",
  background_remove: "배경 제거",
  resize: "리사이즈",
  format_convert: "형식 변환",
  analyze: "분석",
  restore: "복원",
};

function createId(prefix: string): string {
  const suffix = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `${prefix}:${suffix}`;
}

function extensionFor(mimeType: SupportedMime): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function replaceExtension(name: string, mimeType: SupportedMime): string {
  return `${name.replace(/\.[^.]+$/, "")}.${extensionFor(mimeType)}`;
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 해석하지 못했습니다. PNG, JPEG, WebP 파일인지 확인하세요."));
    image.src = url;
  });
}

async function canvasBlob(canvas: HTMLCanvasElement, mimeType: SupportedMime): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("브라우저가 결과 이미지를 만들지 못했습니다."))),
      mimeType,
      mimeType === "image/jpeg" ? 0.92 : undefined,
    );
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function ImageWorkbenchPanel({
  projectId,
  projectName,
  generationDraftEnabled,
  onCreateGenerationDraft,
}: ImageWorkbenchPanelProps) {
  const [versions, setVersions] = useState<ImageWorkbenchVersion[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [resizeWidth, setResizeWidth] = useState(512);
  const [resizeHeight, setResizeHeight] = useState(512);
  const [outputMime, setOutputMime] = useState<SupportedMime>("image/png");
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [backgroundTolerance, setBackgroundTolerance] = useState(38);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showMetadata, setShowMetadata] = useState(false);
  const [handoffPreview, setHandoffPreview] = useState<string | null>(null);
  const [durableArtifacts, setDurableArtifacts] = useState<DurableImageArtifact[]>([]);
  const [durableEventCount, setDurableEventCount] = useState(0);
  const [durableLoading, setDurableLoading] = useState(false);
  const [partialFailureReason, setPartialFailureReason] = useState("");
  const ownedUrls = useRef(new Set<string>());

  const selected = useMemo(
    () => versions.find((version) => version.id === selectedId) ?? versions.at(-1) ?? null,
    [selectedId, versions],
  );
  const original = versions[0] ?? null;
  const metadata = selected ? buildImageArtifactMetadata(selected) : null;
  const nextVersion = () => Math.max(0, ...versions.map((version) => version.version)) + 1;
  const normalizedProjectId = projectId.startsWith("project:") ? projectId : `project:${projectId}`;
  const durableSelected = selected ? durableArtifacts.find((artifact) => artifact.artifact_id === selected.id) : null;

  useEffect(() => {
    const urls = ownedUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  useEffect(() => {
    setVersions([]);
    setSelectedId("");
    setGenerationPrompt("");
    setError(null);
    setNotice(null);
    setHandoffPreview(null);
    setDurableArtifacts([]);
    setDurableEventCount(0);
    setPartialFailureReason("");
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    setDurableLoading(true);
    void readDurableImageProject(normalizedProjectId)
      .then((state) => {
        if (!active) return;
        setDurableArtifacts(state.artifacts);
        setDurableEventCount(state.event_count);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Artifact 저장소를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setDurableLoading(false);
      });
    return () => {
      active = false;
    };
  }, [normalizedProjectId, projectId]);

  const rememberUrl = (blob: Blob): string => {
    const url = URL.createObjectURL(blob);
    ownedUrls.current.add(url);
    return url;
  };

  const handleInput = async (file: File | null) => {
    if (!file) return;
    if (!projectId) {
      setError("프로젝트를 먼저 선택하세요.");
      return;
    }
    if (!(["image/png", "image/jpeg", "image/webp"] as string[]).includes(file.type)) {
      setError("PNG, JPEG, WebP 이미지만 입력할 수 있습니다.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const objectUrl = rememberUrl(file);
      const image = await loadImage(objectUrl);
      const now = new Date().toISOString();
      const id = createId("artifact:image");
      const next: ImageWorkbenchVersion = {
        id,
        projectId: projectId.startsWith("project:") ? projectId : `project:${projectId}`,
        taskId: createId("task:image-workbench"),
        runId: createId("run:image-workbench"),
        traceId: createId("trace:image-workbench"),
        createdByAgentId: "design-worker:local-workbench",
        skillId: "image.local-workbench",
        skillVersion: "1.0.0",
        model: "browser-canvas",
        promptVersion: "local-input-v1",
        operation: "input",
        version: 1,
        parentId: null,
        sourceIds: [],
        sourceName: file.name,
        outputName: file.name,
        objectUrl,
        blob: file,
        sha256: await sha256(file),
        mimeType: file.type as SupportedMime,
        width: image.naturalWidth,
        height: image.naturalHeight,
        rightsSource: "user-supplied-local",
        createdAt: now,
        modifiedAt: now,
        processingStatus: "complete",
        failureReason: null,
        analysisSummary: `${image.naturalWidth} × ${image.naturalHeight}, ${file.type}, ${formatBytes(file.size)}`,
        approvalStatus: "draft",
        exportedAt: null,
      };
      setVersions([next]);
      setSelectedId(next.id);
      setResizeWidth(image.naturalWidth);
      setResizeHeight(image.naturalHeight);
      setOutputMime(next.mimeType);
      setNotice("원본을 로컬 Workbench에 불러왔습니다. 아직 서버나 프로젝트 폴더에는 저장하지 않았습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "이미지 입력에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const transform = async (
    operation: Exclude<ImageWorkbenchOperation, "input" | "generate" | "restore" | "analyze">,
    options: { width: number; height: number; mimeType: SupportedMime; filter?: string; removeBackground?: boolean },
  ) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const image = await loadImage(selected.objectUrl);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(options.width));
      canvas.height = Math.max(1, Math.round(options.height));
      const context = canvas.getContext("2d", { willReadFrequently: Boolean(options.removeBackground) });
      if (!context) throw new Error("이 브라우저에서 Canvas 작업을 시작하지 못했습니다.");
      if (options.mimeType === "image/jpeg") {
        context.fillStyle = "#f8fafc";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      if (options.filter) context.filter = options.filter;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      context.filter = "none";

      if (options.removeBackground) {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const [baseR, baseG, baseB] = pixels.data;
        for (let index = 0; index < pixels.data.length; index += 4) {
          const distance = Math.hypot(
            pixels.data[index] - baseR,
            pixels.data[index + 1] - baseG,
            pixels.data[index + 2] - baseB,
          );
          if (distance <= backgroundTolerance) pixels.data[index + 3] = 0;
        }
        context.putImageData(pixels, 0, 0);
      }

      const mimeType = options.removeBackground ? "image/png" : options.mimeType;
      const blob = await canvasBlob(canvas, mimeType);
      const objectUrl = rememberUrl(blob);
      const now = new Date().toISOString();
      const next = deriveImageVersion(selected, {
        id: createId("artifact:image"),
        traceId: createId("trace:image-workbench"),
        operation,
        blob,
        objectUrl,
        sha256: await sha256(blob),
        mimeType,
        width: canvas.width,
        height: canvas.height,
        outputName: replaceExtension(selected.outputName, mimeType),
        createdAt: now,
        nextVersion: nextVersion(),
        analysisSummary: `${canvas.width} × ${canvas.height}, ${mimeType}, ${formatBytes(blob.size)}`,
      });
      setVersions((current) => [...current, next]);
      setSelectedId(next.id);
      setOutputMime(next.mimeType);
      setNotice(`${operationLabels[operation]} 결과를 버전 ${next.version} 초안으로 만들었습니다.`);
    } catch (reason) {
      const failureReason = reason instanceof Error ? reason.message : "원인을 확인하지 못했습니다.";
      const now = new Date().toISOString();
      const partial = derivePartialImageVersion(selected, {
        id: createId("artifact:image"),
        traceId: createId("trace:image-workbench"),
        operation,
        createdAt: now,
        nextVersion: nextVersion(),
        failureReason,
      });
      setVersions((current) => [...current, partial]);
      setSelectedId(partial.id);
      setError(
        `${operationLabels[operation]} 실패: ${failureReason} 원본은 부분 결과 버전으로 보존했습니다. 다음 행동: 입력 형식과 브라우저 Canvas 지원을 확인한 뒤 다시 시도하세요.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const updateSelected = (patch: Partial<ImageWorkbenchVersion>) => {
    if (!selected) return;
    setVersions((current) =>
      current.map((version) =>
        version.id === selected.id ? { ...version, ...patch, modifiedAt: new Date().toISOString() } : version,
      ),
    );
  };

  const refreshDurableState = async () => {
    const state = await readDurableImageProject(normalizedProjectId);
    setDurableArtifacts(state.artifacts);
    setDurableEventCount(state.event_count);
    return state;
  };

  const handlePersist = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await registerDurableImageArtifact(selected);
      await refreshDurableState();
      setNotice("프로젝트 Artifact 저장소에 SHA-256 검증 후 등록했습니다. 외부 발행은 실행하지 않았습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "프로젝트 Artifact 등록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleDurableDecision = async (decision: "approved" | "discarded") => {
    if (!selected) return;
    if (!durableSelected) {
      updateSelected({ approvalStatus: decision });
      setNotice("브라우저 미리보기 상태만 변경했습니다. 서버 기록이 필요하면 먼저 Artifact를 등록하세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await decideDurableImageArtifact(selected, decision, durableSelected.approval_status);
      updateSelected({ approvalStatus: result.artifact.approval_status });
      await refreshDurableState();
      setNotice(`CONTROL ${decision} 결정을 append-only 이벤트로 기록했습니다.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Artifact 결정 기록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleHandoff = async () => {
    if (!selected) return;
    if (!durableSelected) {
      setHandoffPreview(`project=${selected.projectId} · artifact=${selected.id} · trace=${selected.traceId}`);
      setNotice("로컬 Handoff 미리보기만 만들었습니다. 먼저 Artifact를 등록하면 서버에 의도를 기록할 수 있습니다.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await handoffDurableImageArtifact(selected);
      await refreshDurableState();
      setHandoffPreview(
        `project=${selected.projectId} · artifact=${selected.id} · dispatched=${result.dispatched} · accepted=${result.accepted}`,
      );
      setNotice(
        "활성 IMPLEMENT Agent의 로컬 durable inbox가 Handoff를 수신했습니다. 외부 작업과 발행은 실행하지 않았습니다.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Handoff 기록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handlePartialFailure = async () => {
    if (!selected || !durableSelected) return;
    const failureReason = partialFailureReason.trim();
    if (!failureReason) {
      setError("부분 결과의 원인을 입력하세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await recordDurableImagePartialFailure(selected, failureReason);
      updateSelected({
        processingStatus: result.artifact.processing_status,
        failureReason: result.artifact.failure_reason,
        approvalStatus: result.artifact.approval_status,
      });
      await refreshDurableState();
      setNotice("부분 결과와 원인을 append-only 이벤트로 보존했습니다. 복원 버튼으로 새 버전을 만들 수 있습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "부분 실패 기록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleAnalyze = () => {
    if (!selected) return;
    updateSelected({
      operation: selected.operation === "input" ? "analyze" : selected.operation,
      analysisSummary: `${selected.width} × ${selected.height}, ${selected.mimeType}, ${formatBytes(selected.blob.size)}, SHA-256 ${selected.sha256.slice(0, 12)}…`,
    });
    setNotice("현재 버전의 크기, 형식, 용량, 체크섬을 분석했습니다.");
  };

  const handleRestore = (version: ImageWorkbenchVersion) => {
    const now = new Date().toISOString();
    const parent = versions.reduce(
      (latest, candidate) => (candidate.version > latest.version ? candidate : latest),
      version,
    );
    const restored = restoreImageVersion(version, {
      id: createId("artifact:image"),
      traceId: createId("trace:image-workbench"),
      objectUrl: rememberUrl(version.blob),
      createdAt: now,
      nextVersion: nextVersion(),
      parent,
    });
    setVersions((current) => [...current, restored]);
    setSelectedId(restored.id);
    setNotice(`버전 ${version.version}을 새 버전 ${restored.version} 초안으로 복원했습니다.`);
  };

  const handleExport = async () => {
    if (!selected || !canExportImageVersion(selected)) {
      setError("승인된 결과만 내보낼 수 있습니다. 먼저 현재 버전을 승인하세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (durableSelected) {
        await exportDurableImageArtifact(selected);
        await refreshDurableState();
      }
      const anchor = document.createElement("a");
      anchor.href = selected.objectUrl;
      anchor.download = selected.outputName;
      anchor.click();
      updateSelected({ exportedAt: new Date().toISOString() });
      setNotice(
        durableSelected
          ? "export 이벤트를 기록하고 로컬 파일로 내려받았습니다. 외부 발행은 실행하지 않았습니다."
          : "승인된 브라우저 미리보기를 로컬 파일로 내려받았습니다. 서버 기록은 만들지 않았습니다.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Artifact 내보내기에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleLocalGeneration = async () => {
    const prompt = generationPrompt.trim();
    if (!projectId) {
      setError("프로젝트를 먼저 선택하세요.");
      return;
    }
    if (!prompt) {
      setError("로컬 그래픽 프리뷰에 사용할 문구를 입력하세요.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 630;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("이 브라우저에서 Canvas 그래픽 프리뷰를 만들 수 없습니다.");
      context.fillStyle = "#0f172a";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#22d3ee";
      context.fillRect(0, 0, 24, canvas.height);
      context.fillStyle = "#f8fafc";
      context.font = "700 52px system-ui, sans-serif";
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillText(prompt.slice(0, 54), 80, 285, 1040);
      context.fillStyle = "#94a3b8";
      context.font = "500 24px system-ui, sans-serif";
      context.fillText(`${projectName} · local graphic preview`, 80, 360, 1040);

      const blob = await canvasBlob(canvas, "image/png");
      const objectUrl = rememberUrl(blob);
      const now = new Date().toISOString();
      const versionNumber = nextVersion();
      const generated: ImageWorkbenchVersion = {
        id: createId("artifact:image"),
        projectId: projectId.startsWith("project:") ? projectId : `project:${projectId}`,
        taskId: createId("task:image-workbench"),
        runId: createId("run:image-workbench"),
        traceId: createId("trace:image-workbench"),
        createdByAgentId: "design-worker:local-workbench",
        skillId: "image.local-graphic-preview",
        skillVersion: "1.0.0",
        model: "browser-canvas-template",
        promptVersion: "local-graphic-preview-v1",
        operation: "generate",
        version: versionNumber,
        parentId: selected?.id ?? null,
        sourceIds: selected ? [selected.id] : [],
        sourceName: selected?.outputName ?? "local-prompt",
        outputName: `local-graphic-v${versionNumber}.png`,
        objectUrl,
        blob,
        sha256: await sha256(blob),
        mimeType: "image/png",
        width: canvas.width,
        height: canvas.height,
        rightsSource: "locally-generated-template",
        createdAt: now,
        modifiedAt: now,
        processingStatus: "complete",
        failureReason: null,
        analysisSummary: `1200 × 630, image/png, ${formatBytes(blob.size)}, prompt ${prompt.length} chars`,
        approvalStatus: "draft",
        exportedAt: null,
      };
      setVersions((current) => [...current, generated]);
      setSelectedId(generated.id);
      setResizeWidth(generated.width);
      setResizeHeight(generated.height);
      setOutputMime(generated.mimeType);
      setNotice(
        `로컬 그래픽 프리뷰를 버전 ${generated.version} 초안으로 만들었습니다. 외부 AI 생성, 서버 저장, 발행은 실행하지 않았습니다.`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "로컬 그래픽 프리뷰 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleGenerationDraft = async () => {
    setBusy(true);
    setError(null);
    try {
      await onCreateGenerationDraft();
      setNotice("외부 생성 실행 전 단계인 프로젝트 이미지 작업 초안을 만들었습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "이미지 생성 초안을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900/90 p-4 shadow-xl shadow-slate-950/20">
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-cyan-300">IMAGE WORKBENCH</p>
          <h3 className="mt-1 text-xl font-bold text-white">이미지 작업대</h3>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">
            로컬 브라우저에서 결과를 만들고 비교합니다. Artifact 등록과 Agent 전달은 승인 전까지 미리보기만 제공합니다.
          </p>
        </div>
        <div className="min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300">
          <span className="block text-slate-500">현재 프로젝트</span>
          <span className="mt-1 block truncate font-semibold text-white">{projectName || "선택 안 됨"}</span>
          <span className="mt-0.5 block truncate font-mono text-[10px] text-cyan-200">
            {projectId || "project required"}
          </span>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100"
        >
          <strong className="block">작업을 완료하지 못했습니다.</strong>
          <span className="mt-1 block leading-5">{error}</span>
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100"
        >
          {notice}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="space-y-4">
          {!selected ? (
            <div className="rounded-2xl border border-dashed border-slate-600 bg-slate-950/60 px-5 py-10 text-center">
              <p className="text-sm font-semibold text-white">원본 이미지부터 선택하세요.</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                PNG, JPEG, WebP를 로컬에서 처리하며 업로드하지 않습니다.
              </p>
              <label className="mt-5 inline-flex cursor-pointer rounded-lg border border-cyan-300/50 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-100 transition active:scale-[0.98]">
                이미지 입력
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={busy || !projectId}
                  onChange={(event) => void handleInput(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <figure className="min-w-0">
                  <figcaption className="mb-2 flex items-center justify-between text-xs text-slate-400">
                    <span>원본</span>
                    <span>{original ? `${original.width} × ${original.height}` : "-"}</span>
                  </figcaption>
                  <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-2xl border border-slate-700 bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%),linear-gradient(-45deg,#1e293b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1e293b_75%),linear-gradient(-45deg,transparent_75%,#1e293b_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0px] p-3">
                    {original ? (
                      <img src={original.objectUrl} alt="입력 원본" className="max-h-80 max-w-full object-contain" />
                    ) : null}
                  </div>
                </figure>
                <figure className="min-w-0">
                  <figcaption className="mb-2 flex items-center justify-between text-xs text-slate-400">
                    <span>선택 결과 · 버전 {selected.version}</span>
                    <span>
                      {selected.width} × {selected.height}
                    </span>
                  </figcaption>
                  <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-2xl border border-cyan-400/30 bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%),linear-gradient(-45deg,#1e293b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1e293b_75%),linear-gradient(-45deg,transparent_75%,#1e293b_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0px] p-3">
                    <img
                      src={selected.objectUrl}
                      alt={`버전 ${selected.version} 결과`}
                      className="max-h-80 max-w-full object-contain"
                    />
                  </div>
                </figure>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <fieldset className="rounded-2xl border border-slate-800 p-3">
                  <legend className="px-1 text-xs font-semibold text-white">편집</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-[11px] text-slate-400">
                      밝기
                      <input
                        type="number"
                        min={20}
                        max={180}
                        value={brightness}
                        onChange={(event) => setBrightness(Number(event.target.value))}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                      />
                    </label>
                    <label className="text-[11px] text-slate-400">
                      대비
                      <input
                        type="number"
                        min={20}
                        max={180}
                        value={contrast}
                        onChange={(event) => setContrast(Number(event.target.value))}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void transform("edit", {
                        width: selected.width,
                        height: selected.height,
                        mimeType: selected.mimeType,
                        filter: `brightness(${brightness}%) contrast(${contrast}%)`,
                      })
                    }
                    className="mt-2 w-full rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-100 transition active:scale-[0.98] disabled:opacity-50"
                  >
                    편집 버전 만들기
                  </button>
                </fieldset>

                <fieldset className="rounded-2xl border border-slate-800 p-3">
                  <legend className="px-1 text-xs font-semibold text-white">배경 제거</legend>
                  <label className="mt-2 block text-[11px] text-slate-400">
                    좌상단 색상 허용 오차 {backgroundTolerance}
                    <input
                      type="range"
                      min={5}
                      max={120}
                      value={backgroundTolerance}
                      onChange={(event) => setBackgroundTolerance(Number(event.target.value))}
                      className="mt-2 w-full accent-cyan-400"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void transform("background_remove", {
                        width: selected.width,
                        height: selected.height,
                        mimeType: "image/png",
                        removeBackground: true,
                      })
                    }
                    className="mt-3 w-full rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-100 transition active:scale-[0.98] disabled:opacity-50"
                  >
                    투명 배경 버전 만들기
                  </button>
                </fieldset>

                <fieldset className="rounded-2xl border border-slate-800 p-3">
                  <legend className="px-1 text-xs font-semibold text-white">리사이즈</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-[11px] text-slate-400">
                      너비
                      <input
                        type="number"
                        min={1}
                        max={8192}
                        value={resizeWidth}
                        onChange={(event) => setResizeWidth(Number(event.target.value))}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                      />
                    </label>
                    <label className="text-[11px] text-slate-400">
                      높이
                      <input
                        type="number"
                        min={1}
                        max={8192}
                        value={resizeHeight}
                        onChange={(event) => setResizeHeight(Number(event.target.value))}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={busy || resizeWidth < 1 || resizeHeight < 1}
                    onClick={() =>
                      void transform("resize", {
                        width: resizeWidth,
                        height: resizeHeight,
                        mimeType: selected.mimeType,
                      })
                    }
                    className="mt-2 w-full rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-100 transition active:scale-[0.98] disabled:opacity-50"
                  >
                    새 크기 버전 만들기
                  </button>
                </fieldset>

                <fieldset className="rounded-2xl border border-slate-800 p-3">
                  <legend className="px-1 text-xs font-semibold text-white">형식 변환·분석</legend>
                  <label className="mt-2 block text-[11px] text-slate-400">
                    결과 형식
                    <select
                      value={outputMime}
                      onChange={(event) => setOutputMime(event.target.value as SupportedMime)}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                    >
                      <option value="image/png">PNG</option>
                      <option value="image/jpeg">JPEG</option>
                      <option value="image/webp">WebP</option>
                    </select>
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void transform("format_convert", {
                          width: selected.width,
                          height: selected.height,
                          mimeType: outputMime,
                        })
                      }
                      className="rounded-lg border border-slate-600 px-2 py-2 text-xs font-semibold text-slate-100 transition active:scale-[0.98] disabled:opacity-50"
                    >
                      형식 변환
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleAnalyze}
                      className="rounded-lg border border-slate-600 px-2 py-2 text-xs font-semibold text-slate-100 transition active:scale-[0.98] disabled:opacity-50"
                    >
                      이미지 분석
                    </button>
                  </div>
                </fieldset>
              </div>
            </>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
            <h4 className="text-xs font-semibold text-white">작업 시작</h4>
            <label className="mt-3 flex cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-100 transition active:scale-[0.98]">
              다른 이미지 입력
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={busy || !projectId}
                onChange={(event) => void handleInput(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className="mt-3 block text-[11px] text-slate-400">
              로컬 그래픽 프리뷰 문구
              <input
                type="text"
                value={generationPrompt}
                maxLength={120}
                onChange={(event) => setGenerationPrompt(event.target.value)}
                placeholder="예: 여름 교토 3일 여행 가이드"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"
              />
            </label>
            <button
              type="button"
              disabled={busy || !projectId || !generationPrompt.trim()}
              onClick={() => void handleLocalGeneration()}
              className="mt-2 w-full rounded-lg border border-violet-400/40 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-100 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
            >
              로컬 그래픽 프리뷰 생성
            </button>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">
              1200×630 Canvas 초안만 만듭니다. 외부 AI, 서버 저장, Artifact 등록, 발행은 실행하지 않습니다.
            </p>
            <button
              type="button"
              disabled={busy || !generationDraftEnabled}
              onClick={() => void handleGenerationDraft()}
              className="mt-2 w-full rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
            >
              이미지 생성 작업 초안
            </button>
            {!generationDraftEnabled ? (
              <p className="mt-2 text-[11px] leading-4 text-slate-500">
                이미지 모듈을 먼저 선택하면 외부 생성 실행 전 초안을 만들 수 있습니다.
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-white">버전 기록</h4>
              <span className="text-[11px] text-slate-500">{versions.length}</span>
            </div>
            {versions.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">이미지를 입력하면 버전과 lineage가 여기에 쌓입니다.</p>
            ) : (
              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className={`rounded-lg border p-2 ${version.id === selected?.id ? "border-cyan-400/50 bg-cyan-500/10" : "border-slate-800 bg-slate-900"}`}
                  >
                    <button type="button" onClick={() => setSelectedId(version.id)} className="w-full text-left">
                      <span className="flex items-center justify-between gap-2 text-[11px]">
                        <strong className="text-slate-100">
                          버전 {version.version} · {operationLabels[version.operation]}
                        </strong>
                        <span className="text-slate-500">{version.approvalStatus}</span>
                      </span>
                      <span className="mt-1 block truncate font-mono text-[10px] text-slate-500">
                        {version.traceId}
                      </span>
                      <span className="mt-1 block text-[10px] text-slate-400">
                        {version.processingStatus}
                        {version.failureReason ? ` · ${version.failureReason}` : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRestore(version)}
                      className="mt-2 rounded-md border border-slate-700 px-2 py-1 text-[10px] text-slate-300 transition active:scale-[0.98]"
                    >
                      이 버전 복원
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div
              className="mt-3 rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-[10px] leading-4 text-slate-400"
              data-testid="durable-project-summary"
            >
              <strong className="text-slate-200">재시작 복구 저장소</strong>
              <span className="ml-2">
                {durableLoading ? "확인 중" : `Artifact ${durableArtifacts.length} · event ${durableEventCount}`}
              </span>
              {durableArtifacts.slice(-3).map((artifact) => (
                <span key={artifact.artifact_id} className="mt-1 block truncate font-mono">
                  {artifact.artifact_id} · {artifact.approval_status} · v{artifact.version}
                </span>
              ))}
            </div>
          </div>

          {selected ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
              <h4 className="text-xs font-semibold text-white">검토·전달</h4>
              {selected.analysisSummary ? (
                <p className="mt-2 text-[11px] leading-5 text-slate-400">{selected.analysisSummary}</p>
              ) : null}
              {selected.failureReason ? (
                <div className="mt-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-2 text-[11px] leading-5 text-rose-100">
                  <strong className="block">부분 결과 · 원인: {selected.failureReason}</strong>
                  <span>다음 행동: 원본과 입력 설정을 확인한 뒤 새 버전으로 다시 시도하세요.</span>
                </div>
              ) : null}
              <div
                className="mt-3 rounded-lg border border-slate-800 bg-slate-900/80 p-2 text-[11px] leading-5 text-slate-300"
                data-testid="durable-artifact-status"
              >
                <strong className="text-slate-100">프로젝트 저장소</strong>
                <span className="ml-2 text-slate-500">
                  {durableLoading
                    ? "확인 중"
                    : durableSelected
                      ? `${durableSelected.approval_status} · event ${durableEventCount}`
                      : `미등록 · 저장된 Artifact ${durableArtifacts.length}`}
                </span>
                <p className="text-[10px] text-slate-500">
                  append-only 로컬 저장소이며 외부 AI·외부 Agent·발행은 실행하지 않습니다.
                </p>
              </div>
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                <label className="text-[10px] text-slate-400">
                  부분 결과 원인
                  <input
                    type="text"
                    value={partialFailureReason}
                    maxLength={240}
                    onChange={(event) => setPartialFailureReason(event.target.value)}
                    placeholder="예: 배경 가장자리 수동 검토 필요"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] text-white"
                  />
                </label>
                <button
                  type="button"
                  data-testid="durable-artifact-partial-failure"
                  disabled={busy || !durableSelected || !partialFailureReason.trim() || Boolean(selected.exportedAt)}
                  onClick={() => void handlePartialFailure()}
                  className="self-end rounded-lg border border-rose-400/40 px-2 py-2 text-[10px] font-semibold text-rose-100 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
                >
                  부분 결과 기록
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="durable-artifact-approve"
                  disabled={
                    busy ||
                    (durableSelected
                      ? durableSelected.approval_status === "approved"
                      : selected.approvalStatus === "approved")
                  }
                  onClick={() => void handleDurableDecision("approved")}
                  className="rounded-lg border border-emerald-400/40 px-2 py-2 text-xs font-semibold text-emerald-100 transition active:scale-[0.98] disabled:opacity-40"
                >
                  승인
                </button>
                <button
                  type="button"
                  data-testid="durable-artifact-discard"
                  disabled={
                    busy ||
                    (durableSelected
                      ? durableSelected.approval_status === "discarded"
                      : selected.approvalStatus === "discarded")
                  }
                  onClick={() => void handleDurableDecision("discarded")}
                  className="rounded-lg border border-rose-400/40 px-2 py-2 text-xs font-semibold text-rose-100 transition active:scale-[0.98] disabled:opacity-40"
                >
                  폐기
                </button>
                <button
                  type="button"
                  data-testid="durable-artifact-handoff"
                  disabled={busy}
                  onClick={() => void handleHandoff()}
                  className="rounded-lg border border-amber-400/40 px-2 py-2 text-xs font-semibold text-amber-100 transition active:scale-[0.98]"
                >
                  {durableSelected ? "IMPLEMENT에 Handoff" : "Agent 전달 미리보기"}
                </button>
                <button
                  type="button"
                  data-testid="durable-artifact-export"
                  disabled={busy}
                  onClick={() => void handleExport()}
                  className="rounded-lg border border-cyan-400/40 px-2 py-2 text-xs font-semibold text-cyan-100 transition active:scale-[0.98]"
                >
                  다운로드·내보내기
                </button>
              </div>
              {handoffPreview ? (
                <p className="mt-2 break-all rounded-lg bg-slate-900 p-2 font-mono text-[10px] leading-4 text-slate-400">
                  {handoffPreview}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setShowMetadata((value) => !value)}
                className="mt-3 w-full rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 transition active:scale-[0.98]"
              >
                {showMetadata ? "Artifact 메타데이터 닫기" : "Artifact 메타데이터 보기"}
              </button>
              {showMetadata && metadata ? (
                <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-900 p-2 text-[10px] leading-4 text-slate-300">
                  {JSON.stringify(metadata, null, 2)}
                </pre>
              ) : null}
              <button
                type="button"
                data-testid="durable-artifact-register"
                disabled={busy || durableLoading || Boolean(durableSelected)}
                onClick={() => void handlePersist()}
                className="mt-2 w-full rounded-lg border border-cyan-400/40 px-3 py-2 text-xs font-semibold text-cyan-100 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
              >
                {durableSelected ? "프로젝트 Artifact 등록됨" : "프로젝트 Artifact 등록"}
              </button>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

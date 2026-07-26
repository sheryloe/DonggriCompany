import type {
  ControlPlaneActiveSpecSource,
  ControlPlaneParseError,
  ControlPlaneSourceAdapter,
  ControlPlaneSourceProject,
  ControlPlaneSourceSnapshot,
} from "./source-adapter.ts";

export type EpochBoundProjection<T> = {
  source_epoch: string;
  projection_epoch: string;
  generated_at: string;
  data: T;
};

export type ProjectionProvider<T> = (
  snapshot: ControlPlaneSourceSnapshot,
) => Promise<EpochBoundProjection<T> | null> | EpochBoundProjection<T> | null;

export type DonggriProjectionState<TRuntime = unknown, TEvidence = unknown> = {
  generated_at: string;
  source_epoch: string;
  projection_epoch: string;
  degraded: boolean;
  parse_errors: ControlPlaneParseError[];
  active_specs: ControlPlaneActiveSpecSource[];
  active_spec: ControlPlaneActiveSpecSource | null;
  projects: ControlPlaneSourceProject[];
  runtime: EpochBoundProjection<TRuntime> | null;
  evidence: EpochBoundProjection<TEvidence> | null;
  provenance: {
    control_plane: "root-control-plane";
    runtime: "live-runtime" | "unavailable" | "discarded-source-epoch-mismatch" | "discarded-projection-epoch-mismatch";
    evidence:
      | "local-durable-evidence"
      | "unavailable"
      | "discarded-source-epoch-mismatch"
      | "discarded-projection-epoch-mismatch";
  };
};

export type ProjectionServiceOptions<TRuntime, TEvidence> = {
  source_adapter: Pick<ControlPlaneSourceAdapter, "readSnapshot">;
  runtime_provider?: ProjectionProvider<TRuntime>;
  evidence_provider?: ProjectionProvider<TEvidence>;
};

function projectionEpochError(
  kind: "runtime" | "evidence",
  authority: "source" | "projection",
  expected: string,
  actual: string,
): ControlPlaneParseError {
  return {
    source: `projection.${kind}`,
    code: authority === "source" ? "projection_source_epoch_mismatch" : "projection_epoch_mismatch",
    message: `${kind} projection ${authority} epoch ${actual} does not match ${expected}.`,
    path: `projection.${kind}.${authority}_epoch`,
    line: null,
    column: null,
  };
}

export class ProjectionService<TRuntime = unknown, TEvidence = unknown> {
  private readonly sourceAdapter: Pick<ControlPlaneSourceAdapter, "readSnapshot">;
  private readonly runtimeProvider: ProjectionProvider<TRuntime> | undefined;
  private readonly evidenceProvider: ProjectionProvider<TEvidence> | undefined;

  constructor(options: ProjectionServiceOptions<TRuntime, TEvidence>) {
    this.sourceAdapter = options.source_adapter;
    this.runtimeProvider = options.runtime_provider;
    this.evidenceProvider = options.evidence_provider;
  }

  async readState(): Promise<DonggriProjectionState<TRuntime, TEvidence>> {
    const snapshot = this.sourceAdapter.readSnapshot();
    const [runtimeCandidate, evidenceCandidate] = await Promise.all([
      this.runtimeProvider?.(snapshot) ?? null,
      this.evidenceProvider?.(snapshot) ?? null,
    ]);
    const parseErrors = [...snapshot.parse_errors];

    let runtime = runtimeCandidate;
    let runtimeProvenance: DonggriProjectionState["provenance"]["runtime"] = runtime ? "live-runtime" : "unavailable";
    if (runtime && runtime.source_epoch !== snapshot.source_epoch) {
      parseErrors.push(projectionEpochError("runtime", "source", snapshot.source_epoch, runtime.source_epoch));
      runtime = null;
      runtimeProvenance = "discarded-source-epoch-mismatch";
    } else if (runtime && runtime.projection_epoch !== snapshot.projection_epoch) {
      parseErrors.push(
        projectionEpochError("runtime", "projection", snapshot.projection_epoch, runtime.projection_epoch),
      );
      runtime = null;
      runtimeProvenance = "discarded-projection-epoch-mismatch";
    }

    let evidence = evidenceCandidate;
    let evidenceProvenance: DonggriProjectionState["provenance"]["evidence"] = evidence
      ? "local-durable-evidence"
      : "unavailable";
    if (evidence && evidence.source_epoch !== snapshot.source_epoch) {
      parseErrors.push(projectionEpochError("evidence", "source", snapshot.source_epoch, evidence.source_epoch));
      evidence = null;
      evidenceProvenance = "discarded-source-epoch-mismatch";
    } else if (evidence && evidence.projection_epoch !== snapshot.projection_epoch) {
      parseErrors.push(
        projectionEpochError("evidence", "projection", snapshot.projection_epoch, evidence.projection_epoch),
      );
      evidence = null;
      evidenceProvenance = "discarded-projection-epoch-mismatch";
    }

    return {
      generated_at: snapshot.generated_at,
      source_epoch: snapshot.source_epoch,
      projection_epoch: snapshot.projection_epoch,
      degraded: snapshot.degraded || parseErrors.length > 0,
      parse_errors: parseErrors,
      active_specs: snapshot.active_specs,
      active_spec: snapshot.active_spec,
      projects: snapshot.projects,
      runtime,
      evidence,
      provenance: {
        control_plane: "root-control-plane",
        runtime: runtimeProvenance,
        evidence: evidenceProvenance,
      },
    };
  }
}

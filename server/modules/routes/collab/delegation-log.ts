type DelegationTraceInput = {
  label?: string;
  family?: string | null;
  specialization?: string | null;
  fallbackReason?: string | null;
  authorityReason?: string | null;
  blockingReason?: string | null;
};

function normalizeField(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : "none";
}

export function formatDelegationTrace(input: DelegationTraceInput): string {
  const label = normalizeField(input.label).replace(/^none$/i, "Delegation decision");
  return `${label} family=${normalizeField(input.family)} specialization=${normalizeField(input.specialization)} fallback_reason=${normalizeField(input.fallbackReason)} authority_reason=${normalizeField(input.authorityReason)} blocking_reason=${normalizeField(input.blockingReason)}`;
}

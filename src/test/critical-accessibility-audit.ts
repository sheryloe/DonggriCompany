const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "details > summary",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export interface CriticalAccessibilityFinding {
  rule: string;
  target: string;
  message: string;
}

function targetLabel(element: Element): string {
  const id = element.getAttribute("id");
  const testId = element.getAttribute("data-testid");
  if (id) return `${element.tagName.toLowerCase()}#${id}`;
  if (testId) return `${element.tagName.toLowerCase()}[data-testid="${testId}"]`;
  return element.tagName.toLowerCase();
}

function hasAccessibleText(element: HTMLElement): boolean {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelText = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
      .join(" ")
      .trim();
    if (labelText) return true;
  }

  return Boolean(
    element.getAttribute("aria-label")?.trim() || element.getAttribute("title")?.trim() || element.textContent?.trim(),
  );
}

export function auditCriticalAccessibility(container: HTMLElement): CriticalAccessibilityFinding[] {
  const findings: CriticalAccessibilityFinding[] = [];
  const elementsWithIds = Array.from(container.querySelectorAll<HTMLElement>("[id]"));
  const idCounts = new Map<string, number>();

  for (const element of elementsWithIds) {
    const id = element.id;
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }

  for (const [id, count] of idCounts) {
    if (count > 1) {
      findings.push({ rule: "duplicate-id", target: `#${id}`, message: `ID가 ${count}회 중복되었습니다.` });
    }
  }

  for (const element of container.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR)) {
    if (!hasAccessibleText(element)) {
      findings.push({
        rule: "interactive-name",
        target: targetLabel(element),
        message: "인터랙티브 요소에 접근 가능한 이름이 없습니다.",
      });
    }

    const nestedInteractive = element.querySelector<HTMLElement>(INTERACTIVE_SELECTOR);
    if (nestedInteractive) {
      findings.push({
        rule: "nested-interactive",
        target: targetLabel(element),
        message: `${targetLabel(nestedInteractive)} 요소가 인터랙티브 요소 안에 중첩되었습니다.`,
      });
    }
  }

  for (const details of container.querySelectorAll<HTMLDetailsElement>("details")) {
    const directSummaries = Array.from(details.children).filter((child) => child.tagName === "SUMMARY");
    if (directSummaries.length !== 1) {
      findings.push({
        rule: "details-summary",
        target: targetLabel(details),
        message: `details 요소의 직접 summary가 ${directSummaries.length}개입니다.`,
      });
    }
  }

  for (const element of container.querySelectorAll<HTMLElement>("[aria-labelledby], [aria-describedby]")) {
    for (const attribute of ["aria-labelledby", "aria-describedby"] as const) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      for (const id of value.split(/\s+/)) {
        if (id && !document.getElementById(id)) {
          findings.push({
            rule: "aria-reference",
            target: targetLabel(element),
            message: `${attribute}가 존재하지 않는 #${id}를 참조합니다.`,
          });
        }
      }
    }
  }

  for (const image of container.querySelectorAll<HTMLImageElement>("img")) {
    if (!image.hasAttribute("alt")) {
      findings.push({ rule: "image-alt", target: targetLabel(image), message: "img 요소에 alt 속성이 없습니다." });
    }
  }

  return findings;
}

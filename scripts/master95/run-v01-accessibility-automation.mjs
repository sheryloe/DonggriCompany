import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { collectThemeContrastAcrossViews } from "../qa/office-theme-requirements-lib/contrast-audit.mjs";
import { waitForAppSettled } from "../qa/office-theme-requirements-lib/theme-helpers.mjs";
import { assertV01NewReportPath, assertV01NewRuntimePath } from "./v01-evidence-file.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const controlRoot = "G:\\Donggri_DevDrive";
const approvalLedger = `${controlRoot}\\storage\\codex-control\\specs\\20260725-donggricompany-v1-stabilization-certification-v1\\approvals.md`;
const requiredApproval = "APR-V1-ALPHA1-SMOKE-001";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function argumentValue(flag) {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : null;
  if (!value || value.startsWith("--")) throw new Error(`${flag.slice(2)}_value_required`);
  return value;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function requireCleanCandidate() {
  const status = execFileSync("git", ["-C", repoRoot, "status", "--porcelain=v1", "--untracked-files=all"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  assert(status.length === 0, "a11y_candidate_worktree_dirty");
}

function candidateBinding() {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const expectedCandidateId = `dongri-grigri-v01-${String(pkg.version ?? "").replace(/^1\.0\.0-/, "")}`;
  const binding = {
    candidate_id: String(pkg.donggriRelease?.candidateId ?? ""),
    candidate_sha: execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
      windowsHide: true,
    })
      .trim()
      .toLowerCase(),
    source_epoch: String(pkg.donggriRelease?.sourceEpoch ?? "").toLowerCase(),
  };
  assert(/^1\.0\.0-(alpha|beta|rc)\.\d+$/.test(String(pkg.version ?? "")), "a11y_product_version_invalid");
  assert(binding.candidate_id === expectedCandidateId, "a11y_candidate_id_mismatch");
  assert(/^[0-9a-f]{40}$/.test(binding.candidate_sha), "a11y_candidate_sha_invalid");
  assert(/^sha256:[0-9a-f]{64}$/.test(binding.source_epoch), "a11y_source_epoch_invalid");
  return binding;
}

function requireApproval(approvalId) {
  assert(approvalId === requiredApproval, "a11y_approval_id_invalid");
  const ledger = fs.readFileSync(approvalLedger, "utf8");
  const start = ledger.search(new RegExp(`^#{2,3}\\s+${approvalId}\\s*$`, "m"));
  assert(start >= 0, "a11y_approval_not_recorded");
  const tail = ledger.slice(start);
  const next = tail.slice(1).search(/\r?\n#{2,3}\s+/);
  const section = next < 0 ? tail : tail.slice(0, next + 1);
  assert(/^- policy_decision:\s*`approved`\s*$/m.test(section), "a11y_approval_not_approved");
}

function boundedInputs(baseUrlInput, artifactRootInput, outputInput) {
  const baseUrl = new URL(baseUrlInput);
  assert(
    (baseUrl.protocol === "http:" || baseUrl.protocol === "https:") &&
      (baseUrl.hostname === "127.0.0.1" || baseUrl.hostname === "localhost" || baseUrl.hostname === "[::1]") &&
      !baseUrl.username &&
      !baseUrl.password &&
      baseUrl.pathname === "/" &&
      !baseUrl.search &&
      !baseUrl.hash,
    "a11y_base_url_must_be_loopback_origin",
  );
  const artifactRoot = assertV01NewRuntimePath(artifactRootInput, "a11y_artifact_root");
  const output = assertV01NewReportPath(outputInput, "a11y_output");
  assert(!fs.existsSync(artifactRoot), "a11y_artifact_root_already_exists");
  assert(!fs.existsSync(output) && !fs.existsSync(`${output}.sha256`), "a11y_output_already_exists");
  return { baseUrl: baseUrl.origin, artifactRoot, output };
}

async function collectFocusEvidence(page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    document.body.focus();
  });
  const selector =
    "a[href],button:not(:disabled),details>summary,input:not([type=hidden]):not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex='-1'])";
  const visibleCount = await page.locator(selector).evaluateAll(
    (elements) =>
      elements.filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }).length,
  );
  const steps = Math.min(visibleCount + 1, 101);
  const samples = [];
  for (let index = 0; index < steps; index += 1) {
    await page.keyboard.press("Tab");
    samples.push(
      await page.evaluate((interactiveSelector) => {
        const element = document.activeElement;
        if (!(element instanceof HTMLElement)) {
          return { identity: "none", visible_focus: false, outline: null, box_shadow: null };
        }
        const style = getComputedStyle(element);
        const visibleElements = [...document.querySelectorAll(interactiveSelector)].filter((candidate) => {
          const rect = candidate.getBoundingClientRect();
          const candidateStyle = getComputedStyle(candidate);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            candidateStyle.visibility !== "hidden" &&
            candidateStyle.display !== "none"
          );
        });
        const activeIndex = visibleElements.indexOf(element);
        const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
        const outlineVisible = style.outlineStyle !== "none" && outlineWidth >= 1;
        const shadowVisible = style.boxShadow !== "none" && style.boxShadow !== "";
        const identity = [
          element.tagName.toLowerCase(),
          element.id ? `#${element.id}` : "",
          element.getAttribute("aria-label") ?? "",
          element.getAttribute("title") ?? "",
          element.textContent?.trim().slice(0, 80) ?? "",
          `index=${activeIndex}`,
        ].join("|");
        return {
          identity,
          visible_focus: element.matches(":focus-visible") && (outlineVisible || shadowVisible),
          outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
          box_shadow: style.boxShadow,
        };
      }, selector),
    );
  }
  const identities = samples.map((sample) => sample.identity).filter((identity) => identity !== "none");
  const firstSeen = new Map();
  let firstRepeatIndex = -1;
  for (const [index, identity] of identities.entries()) {
    if (firstSeen.has(identity)) {
      firstRepeatIndex = index;
      break;
    }
    firstSeen.set(identity, index);
  }
  const expectedUniqueTraversal = Math.min(visibleCount, 100);
  const focusCycleComplete =
    visibleCount > 0 &&
    visibleCount <= 100 &&
    identities.length === visibleCount + 1 &&
    firstRepeatIndex === visibleCount &&
    identities[0] === identities[visibleCount];
  return {
    visible_interactive_count: visibleCount,
    sampled_focus_count: samples.length,
    missing_visible_focus_count: samples.filter((sample) => !sample.visible_focus).length,
    focus_trap_count: firstRepeatIndex >= 0 && firstRepeatIndex < expectedUniqueTraversal ? 1 : 0,
    focus_cycle_complete: focusCycleComplete,
    samples,
  };
}

async function collectCriticalFindings(page) {
  return page.evaluate(() => {
    const findings = [];
    const push = (code, target, message) => findings.push({ code, severity: "critical", target, message });
    const ids = new Map();
    for (const element of document.querySelectorAll("[id]")) {
      ids.set(element.id, (ids.get(element.id) ?? 0) + 1);
    }
    for (const [id, count] of ids) {
      if (count > 1) push("duplicate-id", `#${id}`, `duplicate id count ${count}`);
    }
    const interactiveSelector =
      "a[href],button,details>summary,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex='-1'])";
    for (const element of document.querySelectorAll(interactiveSelector)) {
      const target = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}`;
      const labelledBy = element.getAttribute("aria-labelledby");
      const labelledText = labelledBy
        ? labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
            .join(" ")
            .trim()
        : "";
      const name =
        element.getAttribute("aria-label")?.trim() ||
        labelledText ||
        element.getAttribute("title")?.trim() ||
        element.textContent?.trim();
      if (!name) push("interactive-name", target, "interactive element has no accessible name");
      if (element.querySelector(interactiveSelector)) {
        push("nested-interactive", target, "interactive element contains another interactive element");
      }
    }
    for (const element of document.querySelectorAll("[aria-labelledby],[aria-describedby]")) {
      for (const attribute of ["aria-labelledby", "aria-describedby"]) {
        for (const id of (element.getAttribute(attribute) ?? "").split(/\s+/).filter(Boolean)) {
          if (!document.getElementById(id)) {
            push("aria-reference", `${element.tagName.toLowerCase()}[${attribute}]`, `missing reference ${id}`);
          }
        }
      }
    }
    for (const image of document.querySelectorAll("img")) {
      if (!image.hasAttribute("alt")) push("image-alt", "img", "image has no alt attribute");
    }
    return findings;
  });
}

async function collectMobileOverflow(browser, baseUrl, artifactRoot) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForAppSettled(page, 5_000, 500);
  const nav = page.locator("aside nav button");
  const count = Math.min(await nav.count(), 7);
  assert(count >= 5, "a11y_mobile_navigation_floor");
  const views = [];
  for (let index = 0; index < count; index += 1) {
    const target = nav.nth(index);
    const viewId = (await target.getAttribute("aria-label"))?.trim();
    assert(viewId, `a11y_mobile_navigation_name_missing:${index}`);
    await target.click();
    await waitForAppSettled(page, 2_000, 250);
    assert(
      await target.evaluate((element) => element.classList.contains("active")),
      `a11y_mobile_view_not_active:${viewId}`,
    );
    views.push(
      await page.evaluate(
        ({ viewIndex, viewId }) => {
          const rootOverflow = Math.max(
            0,
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
            document.body.scrollWidth - document.body.clientWidth,
          );
          let elementOverflow = 0;
          for (const element of document.querySelectorAll("body *")) {
            const rect = element.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            elementOverflow = Math.max(
              elementOverflow,
              Math.ceil(rect.right - window.innerWidth),
              Math.ceil(-rect.left),
            );
          }
          return {
            view_index: viewIndex,
            view_id: viewId,
            viewport_width: window.innerWidth,
            viewport_height: window.innerHeight,
            overflow_px: Math.max(rootOverflow, elementOverflow, 0),
          };
        },
        { viewIndex: index, viewId },
      ),
    );
  }
  await page.screenshot({ path: path.join(artifactRoot, "mobile-390x844.png"), fullPage: true });
  await context.close();
  return {
    maximum_overflow_px: Math.max(...views.map((view) => view.overflow_px)),
    views,
  };
}

export function summarizeV01AccessibilityAutomation(input) {
  const criticalFindings = [
    ...input.criticalFindings,
    ...input.consoleErrors.map((message) => ({
      code: "browser-console-error",
      severity: "critical",
      target: "browser-console",
      message,
    })),
    ...input.pageErrors.map((message) => ({
      code: "browser-page-error",
      severity: "critical",
      target: "browser-page",
      message,
    })),
  ];
  const pass =
    input.darkContrast.pass &&
    input.lightContrast.pass &&
    input.focus.missing_visible_focus_count === 0 &&
    input.focus.focus_trap_count === 0 &&
    input.focus.focus_cycle_complete === true &&
    input.mobile.maximum_overflow_px === 0 &&
    criticalFindings.length === 0;
  return {
    component_status: pass ? "collecting" : "fail",
    measurement: {
      contrast_minimum_dark: input.darkContrast.min_contrast_ratio ?? 0,
      contrast_minimum_light: input.lightContrast.min_contrast_ratio ?? 0,
      keyboard_visible_focus: input.focus.missing_visible_focus_count === 0 ? "pass" : "fail",
      focus_trap_count: input.focus.focus_trap_count,
      focus_cycle_complete: input.focus.focus_cycle_complete === true ? "pass" : "fail",
      mobile_390x844_overflow_px: input.mobile.maximum_overflow_px,
      critical_findings: criticalFindings,
    },
  };
}

async function main() {
  const approvalId = argumentValue("--approval");
  const baseUrlInput = argumentValue("--base-url");
  const artifactRootInput = argumentValue("--artifact-root");
  const outputInput = argumentValue("--output");
  requireApproval(approvalId);
  requireCleanCandidate();
  const bounded = boundedInputs(baseUrlInput, artifactRootInput, outputInput);
  const binding = candidateBinding();
  const healthResponse = await fetch(`${bounded.baseUrl}/api/health`);
  assert(healthResponse.ok, "a11y_runtime_health_failed");

  fs.mkdirSync(bounded.artifactRoot, { recursive: true });
  const trace = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await page.goto(bounded.baseUrl, { waitUntil: "domcontentloaded" });
    await waitForAppSettled(page, 5_000, 700);
    const title = await page.title();
    assert(title.includes("Dongri-grigri"), "a11y_runtime_title_mismatch");
    const themeToggle = page.locator(".theme-toggle-btn").first();
    assert(await themeToggle.isVisible(), "a11y_theme_toggle_missing");
    const onTrace = async (message) => trace.push(`${new Date().toISOString()} ${message}`);
    const darkContrast = await collectThemeContrastAcrossViews(page, "dark", themeToggle, onTrace);
    const lightContrast = await collectThemeContrastAcrossViews(page, "light", themeToggle, onTrace);
    await page.goto(bounded.baseUrl, { waitUntil: "domcontentloaded" });
    await waitForAppSettled(page, 5_000, 500);
    const focus = await collectFocusEvidence(page);
    const criticalFindings = await collectCriticalFindings(page);
    await page.screenshot({ path: path.join(bounded.artifactRoot, "desktop-1440x900.png"), fullPage: true });
    const mobile = await collectMobileOverflow(browser, bounded.baseUrl, bounded.artifactRoot);
    const summary = summarizeV01AccessibilityAutomation({
      darkContrast,
      lightContrast,
      focus,
      mobile,
      criticalFindings,
      consoleErrors,
      pageErrors,
    });
    const report = {
      schema_version: "donggri-v01-accessibility-automation/v1",
      release_label: "V01",
      component_status: summary.component_status,
      certification_claimed: false,
      ...binding,
      approval_id: approvalId,
      generated_at: new Date().toISOString(),
      base_url: bounded.baseUrl,
      measurement: summary.measurement,
      raw_results: {
        dark_contrast: darkContrast,
        light_contrast: lightContrast,
        focus,
        mobile,
        console_errors: consoleErrors,
        page_errors: pageErrors,
      },
      artifacts: {},
    };
    fs.writeFileSync(path.join(bounded.artifactRoot, "trace.log"), `${trace.join("\n")}\n`, "utf8");
    for (const name of ["desktop-1440x900.png", "mobile-390x844.png", "trace.log"]) {
      const assetPath = path.join(bounded.artifactRoot, name);
      report.artifacts[name] = { absolute_path: assetPath, sha256: sha256(fs.readFileSync(assetPath)) };
    }
    const serialized = canonicalJson(report);
    fs.mkdirSync(path.dirname(bounded.output), { recursive: true });
    fs.writeFileSync(bounded.output, serialized, { encoding: "utf8", flag: "wx" });
    fs.writeFileSync(`${bounded.output}.sha256`, `${sha256(serialized)}  ${path.basename(bounded.output)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    process.stdout.write(
      `${JSON.stringify({
        ok: report.component_status !== "fail",
        component_status: report.component_status,
        output: bounded.output,
        contrast_minimum_dark: report.measurement.contrast_minimum_dark,
        contrast_minimum_light: report.measurement.contrast_minimum_light,
        focus_missing: focus.missing_visible_focus_count,
        mobile_overflow_px: mobile.maximum_overflow_px,
        critical_findings: report.measurement.critical_findings.length,
      })}\n`,
    );
    if (report.component_status === "fail") process.exitCode = 2;
  } finally {
    await context.close();
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`,
    );
    process.exitCode = 1;
  });
}

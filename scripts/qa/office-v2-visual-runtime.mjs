#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import sharp from "sharp";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:9100";
const runLabel = process.env.QA_RUN_LABEL ?? new Date().toISOString().replace(/[:.]/g, "-");
const defaultReportRoot = path.resolve(
  "G:\\Donggri_DevDrive\\storage\\codex-control\\reports\\DonggriCompany\\2026-07-13\\visual-v2-qa",
);
const outDir = path.resolve(process.env.QA_OUT_DIR ?? path.join(defaultReportRoot, runLabel));
const startE2eServer = process.env.QA_START_E2E_SERVER === "1";
const serverTimeoutMs = Number(process.env.QA_SERVER_TIMEOUT_MS ?? 90_000);
const browserExecutable = process.env.QA_BROWSER_EXECUTABLE || undefined;

const knownConsoleNoisePatterns = [
  /Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/i,
  /No available adapters\./i,
  /GL Driver Message .* GPU stall due to ReadPixels/i,
];

const viewportMatrix = [
  {
    id: "desktop-1280x720",
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  {
    id: "desktop-1920x1080",
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  {
    id: "mobile-375x812",
    width: 375,
    height: 812,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
];

function isKnownConsoleNoise(issueText) {
  return knownConsoleNoisePatterns.some((pattern) => pattern.test(issueText));
}

function normalizeUrlPath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

function maybeMatchV2Sprite(url) {
  const pathname = normalizeUrlPath(url);
  return pathname.match(/\/sprites\/donggri-visual-v2\/(\d+)-([DLBR])-(\d)\.png$/);
}

function maybeMatchLegacyNumberedSprite(url) {
  const pathname = normalizeUrlPath(url);
  return pathname.match(/\/sprites\/(\d+)-([DLBR])-(\d)\.png$/);
}

function isV2Atlas(url) {
  return normalizeUrlPath(url) === "/sprites/donggri-visual-v2/office-renewal-v3-props-atlas.png";
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function canReach(url, timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await canReach(url, 1500)) return true;
    await sleep(1000);
  }
  return false;
}

function startServerIfNeeded() {
  if (!startE2eServer) return null;
  const logPath = path.join(outDir, "dev-e2e-server.log");
  const log = createWriteStream(logPath, { flags: "a" });
  const child = spawn("corepack", ["pnpm", "run", "dev:e2e"], {
    cwd: repoRoot,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  return { child, logPath, log };
}

function stopServer(handle) {
  if (!handle) return;
  const { child, log } = handle;
  if (!child.pid || child.killed) {
    log.end();
    return;
  }
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }).on("close", () => {
      log.end();
    });
    return;
  }
  child.kill("SIGTERM");
  log.end();
}

function maybeTrackRequestFailure(store, req) {
  const type = req.resourceType();
  const url = req.url();
  if (type === "image" && /favicon\.ico$/i.test(url)) return;
  store.push({
    type,
    url,
    error: req.failure()?.errorText ?? "unknown",
  });
}

async function openOffice(page) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

  const officeCanvas = page.locator("canvas").first();
  if (await officeCanvas.isVisible().catch(() => false)) return;

  const officeButton = page
    .getByRole("button", {
      name: /Office|OfficeView|office|오피스|사무실|업무/i,
    })
    .first();
  if (await officeButton.isVisible().catch(() => false)) {
    await officeButton.click({ force: true });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  }
  await officeCanvas.waitFor({ state: "visible", timeout: 30_000 });
}

async function inspectImagePixels(imagePath) {
  const { data, info } = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const pixelCount = info.width * info.height;
  const step = Math.max(1, Math.floor(Math.sqrt(pixelCount / 12_000)));
  const first = [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, data[3] ?? 0];
  let sampled = 0;
  let changedFromFirst = 0;
  let nonTransparent = 0;
  let sum = 0;
  let sumSq = 0;

  for (let y = 0; y < info.height; y += step) {
    for (let x = 0; x < info.width; x += step) {
      const offset = (y * info.width + x) * channels;
      const r = data[offset] ?? 0;
      const g = data[offset + 1] ?? 0;
      const b = data[offset + 2] ?? 0;
      const a = data[offset + 3] ?? 255;
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sampled += 1;
      sum += luminance;
      sumSq += luminance * luminance;
      if (a > 4) nonTransparent += 1;
      if (Math.abs(r - first[0]) + Math.abs(g - first[1]) + Math.abs(b - first[2]) + Math.abs(a - first[3]) > 18) {
        changedFromFirst += 1;
      }
    }
  }

  const mean = sampled ? sum / sampled : 0;
  const variance = sampled ? Math.max(0, sumSq / sampled - mean * mean) : 0;
  const stddev = Math.sqrt(variance);
  return {
    width: info.width,
    height: info.height,
    sampled_pixels: sampled,
    changed_from_first_pixels: changedFromFirst,
    non_transparent_pixels: nonTransparent,
    luminance_stddev: Number(stddev.toFixed(3)),
    nonblank: info.width >= 300 && info.height >= 250 && sampled > 0 && changedFromFirst / sampled > 0.01 && stddev > 2,
  };
}

async function inspectLayout(page) {
  return page.evaluate(() => {
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      scroll_width: document.documentElement.scrollWidth,
      scroll_height: document.documentElement.scrollHeight,
    };
    const interactiveSelector = "button,a,input,select,textarea,[role='button'],[role='tab']";
    const interactiveOverlapCandidates = Array.from(document.querySelectorAll(interactiveSelector))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const visible =
          rect.width > 4 &&
          rect.height > 4 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          Number(style.opacity || "1") > 0.05;
        if (!visible) return null;
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) return null;
        const top = document.elementFromPoint(x, y);
        if (!top || element.contains(top) || top.contains(element)) return null;
        return {
          tag: element.tagName.toLowerCase(),
          text: (element.textContent || element.getAttribute("aria-label") || "").trim().slice(0, 80),
          rect: {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          covered_by: top.tagName.toLowerCase(),
        };
      })
      .filter(Boolean)
      .slice(0, 20);

    const textOverflowCandidates = Array.from(
      document.querySelectorAll("button,a,label,[role='button'],[role='tab'],h1,h2,h3,p,span,th,td"),
    )
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const text = (element.textContent || "").replace(/\s+/g, " ").trim();
        const visible =
          text.length > 0 &&
          rect.width > 4 &&
          rect.height > 4 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          Number(style.opacity || "1") > 0.05;
        if (!visible) return null;
        if (element.scrollWidth <= element.clientWidth + 4 && element.scrollHeight <= element.clientHeight + 4)
          return null;
        return {
          tag: element.tagName.toLowerCase(),
          text: text.slice(0, 100),
          client_width: element.clientWidth,
          scroll_width: element.scrollWidth,
          client_height: element.clientHeight,
          scroll_height: element.scrollHeight,
          overflow_x: style.overflowX,
          overflow_y: style.overflowY,
        };
      })
      .filter(Boolean)
      .slice(0, 30);

    return {
      viewport,
      interactive_overlap_candidates: interactiveOverlapCandidates,
      text_overflow_candidates: textOverflowCandidates,
    };
  });
}

function summarizeSpriteCoverage(imageResponses) {
  const directions = new Set();
  const frames = new Set();
  const spriteNumbers = new Set();
  const v2SpriteResponses = [];
  const legacyAgentSpriteResponses = [];
  const v2Failures = [];
  let atlasLoaded = false;

  for (const response of imageResponses) {
    const v2Match = maybeMatchV2Sprite(response.url);
    if (v2Match) {
      spriteNumbers.add(v2Match[1]);
      directions.add(v2Match[2]);
      frames.add(v2Match[3]);
      v2SpriteResponses.push(response);
      if (response.status < 200 || response.status >= 300) v2Failures.push(response);
      continue;
    }
    if (isV2Atlas(response.url)) {
      atlasLoaded = response.status >= 200 && response.status < 300;
      if (!atlasLoaded) v2Failures.push(response);
      continue;
    }
    if (maybeMatchLegacyNumberedSprite(response.url)) {
      legacyAgentSpriteResponses.push(response);
    }
  }

  return {
    v2_sprite_response_count: v2SpriteResponses.length,
    v2_unique_sprite_numbers: spriteNumbers.size,
    directions: [...directions].sort(),
    frames: [...frames].sort(),
    atlas_loaded: atlasLoaded,
    v2_failure_count: v2Failures.length,
    v2_failures: v2Failures.slice(0, 20),
    legacy_agent_sprite_response_count: legacyAgentSpriteResponses.length,
    legacy_agent_sprite_responses: legacyAgentSpriteResponses.slice(0, 20),
    sample_v2_sprite_urls: v2SpriteResponses.slice(0, 12).map((item) => item.url),
  };
}

function buildViewportFailures(result) {
  const failures = [];
  const coverage = result.sprite_coverage;
  if (!result.canvas?.nonblank) failures.push("canvas_blank_or_too_uniform");
  if (coverage.v2_sprite_response_count < 24) failures.push("v2_sprite_response_count_too_low");
  if (coverage.v2_unique_sprite_numbers < 4) failures.push("v2_unique_sprite_coverage_too_low");
  for (const direction of ["B", "D", "L", "R"]) {
    if (!coverage.directions.includes(direction)) failures.push(`missing_direction_${direction}`);
  }
  for (const frame of ["1", "2", "3"]) {
    if (!coverage.frames.includes(frame)) failures.push(`missing_frame_${frame}`);
  }
  if (!coverage.atlas_loaded) failures.push("v2_prop_atlas_missing");
  if (coverage.v2_failure_count > 0) failures.push("v2_asset_response_failure");
  if (coverage.legacy_agent_sprite_response_count > 0) failures.push("legacy_agent_sprite_requested");
  if (result.counts.console_issues_unexpected > 0) failures.push("unexpected_console_issue");
  if (result.counts.page_errors > 0) failures.push("page_error");
  if (result.counts.request_failures > 0) failures.push("request_failure");
  if (result.layout.interactive_overlap_candidates.length > 0) failures.push("interactive_overlap_candidate");
  return failures;
}

async function inspectViewport(browser, config) {
  const context = await browser.newContext({
    viewport: { width: config.width, height: config.height },
    deviceScaleFactor: config.deviceScaleFactor,
    isMobile: config.isMobile,
    hasTouch: config.hasTouch,
  });
  const page = await context.newPage();

  const consoleIssues = [];
  const pageErrors = [];
  const requestFailures = [];
  const assetResponses = [];

  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      consoleIssues.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on("pageerror", (err) => {
    pageErrors.push({ message: err.message, stack: err.stack ?? null });
  });
  page.on("requestfailed", (req) => maybeTrackRequestFailure(requestFailures, req));
  page.on("response", (response) => {
    const request = response.request();
    const url = response.url();
    if (request.resourceType() !== "image" && !url.includes("/sprites/")) return;
    assetResponses.push({
      url: response.url(),
      status: response.status(),
      ok: response.ok(),
      resource_type: request.resourceType(),
    });
  });

  await openOffice(page);
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(2500);

  const canvasLocator = page.locator("canvas").first();
  const pageScreenshotPath = path.join(outDir, `${config.id}-page.png`);
  const canvasScreenshotPath = path.join(outDir, `${config.id}-canvas.png`);
  await page.screenshot({ path: pageScreenshotPath, fullPage: true });
  await canvasLocator.screenshot({ path: canvasScreenshotPath });

  const canvas = await inspectImagePixels(canvasScreenshotPath);
  const canvasInfo = await page.evaluate(() => {
    const element = document.querySelector("canvas");
    if (!element) return null;
    return {
      width: element.width,
      height: element.height,
      css_width: element.clientWidth,
      css_height: element.clientHeight,
    };
  });
  const layout = await inspectLayout(page);
  const consoleUnexpected = consoleIssues.filter((issue) => !isKnownConsoleNoise(issue.text));
  const consoleIgnored = consoleIssues.filter((issue) => isKnownConsoleNoise(issue.text));
  const spriteCoverage = summarizeSpriteCoverage(assetResponses);

  await context.close();

  const result = {
    id: config.id,
    viewport: {
      width: config.width,
      height: config.height,
      device_scale_factor: config.deviceScaleFactor,
      is_mobile: config.isMobile,
      has_touch: config.hasTouch,
    },
    canvas: {
      ...canvasInfo,
      ...canvas,
    },
    sprite_coverage: spriteCoverage,
    layout,
    counts: {
      console_issues_total: consoleIssues.length,
      console_issues_unexpected: consoleUnexpected.length,
      console_issues_ignored: consoleIgnored.length,
      page_errors: pageErrors.length,
      request_failures: requestFailures.length,
      asset_responses: assetResponses.length,
    },
    console_issues_unexpected: consoleUnexpected,
    console_issues_ignored: consoleIgnored,
    page_errors: pageErrors,
    request_failures: requestFailures,
    artifacts: {
      page_screenshot: pageScreenshotPath,
      canvas_screenshot: canvasScreenshotPath,
    },
  };
  return {
    ...result,
    failures: buildViewportFailures(result),
  };
}

async function run() {
  await mkdir(outDir, { recursive: true });

  let serverHandle = null;
  const serverAlreadyRunning = await canReach(baseUrl, 1500);
  if (startE2eServer && !serverAlreadyRunning) {
    serverHandle = startServerIfNeeded();
    const ready = await waitForServer(baseUrl, serverTimeoutMs);
    if (!ready) {
      throw new Error(`Timed out waiting for QA server at ${baseUrl}. See ${serverHandle?.logPath ?? "server log"}.`);
    }
  }

  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
  const results = [];
  try {
    for (const config of viewportMatrix) {
      results.push(await inspectViewport(browser, config));
    }
  } finally {
    await browser.close().catch(() => undefined);
    stopServer(serverHandle);
  }

  const aggregate = results.reduce(
    (acc, item) => {
      acc.console_issues_unexpected += item.counts.console_issues_unexpected;
      acc.page_errors += item.counts.page_errors;
      acc.request_failures += item.counts.request_failures;
      acc.v2_sprite_response_count += item.sprite_coverage.v2_sprite_response_count;
      acc.v2_failure_count += item.sprite_coverage.v2_failure_count;
      acc.legacy_agent_sprite_response_count += item.sprite_coverage.legacy_agent_sprite_response_count;
      acc.blank_canvas_count += item.canvas.nonblank ? 0 : 1;
      acc.interactive_overlap_candidates += item.layout.interactive_overlap_candidates.length;
      acc.failure_count += item.failures.length;
      return acc;
    },
    {
      console_issues_unexpected: 0,
      page_errors: 0,
      request_failures: 0,
      v2_sprite_response_count: 0,
      v2_failure_count: 0,
      legacy_agent_sprite_response_count: 0,
      blank_canvas_count: 0,
      interactive_overlap_candidates: 0,
      failure_count: 0,
    },
  );

  const summary = {
    ok: aggregate.failure_count === 0,
    out_dir: outDir,
    base_url: baseUrl,
    generated_at: new Date().toISOString(),
    server_started_by_script: Boolean(serverHandle),
    required_matrix: ["desktop 1280x720", "desktop 1920x1080", "mobile 375x812@2"],
    gates: {
      canvas_nonblank: aggregate.blank_canvas_count === 0,
      v2_sprite_urls_loaded: aggregate.v2_sprite_response_count >= 72,
      v2_prop_atlas_loaded_each_viewport: results.every((item) => item.sprite_coverage.atlas_loaded),
      directions_each_viewport: results.every((item) =>
        ["B", "D", "L", "R"].every((direction) => item.sprite_coverage.directions.includes(direction)),
      ),
      frames_each_viewport: results.every((item) =>
        ["1", "2", "3"].every((frame) => item.sprite_coverage.frames.includes(frame)),
      ),
      no_legacy_agent_sprite_fallback: aggregate.legacy_agent_sprite_response_count === 0,
      no_unexpected_console_page_request_failures:
        aggregate.console_issues_unexpected === 0 && aggregate.page_errors === 0 && aggregate.request_failures === 0,
      no_interactive_overlap_candidates: aggregate.interactive_overlap_candidates === 0,
    },
    aggregate_counts: aggregate,
    viewports: results,
    artifacts: {
      summary_json: path.join(outDir, "summary.json"),
      server_log: serverHandle?.logPath ?? null,
    },
  };

  await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (!summary.ok) process.exitCode = 1;
}

run().catch((error) => {
  process.stderr.write(`[office-v2-visual-runtime] ${error?.stack ?? String(error)}\n`);
  process.exitCode = 1;
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";
import YAML from "yaml";

const ROOT = process.cwd();
const V1_PREFIX = "/api/control-plane/v1";
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const MUTATION_HELPERS = new Set([
  "post",
  "postJsonWithIdempotencyHeader",
  "postMultipartWithIdempotency",
  "postWithIdempotency",
  "put",
  "patch",
  "del",
  "remove",
]);
const APPROVAL_KEYS = new Set(["approval_id", "approval_ref", "confirm", "confirmation_text"]);
const FORBIDDEN_UNICODE_RANGES = [
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0x200e, 0x200f],
  [0x061c, 0x061c],
  [0x200b, 0x200d],
  [0xfeff, 0xfeff],
];

/*
 * V1 certification freezes the runtime ceiling at zero. Deprecated API
 * definitions may remain for compatibility, but no non-test runtime source may
 * call a v1 mutation route or embed an approval/confirmation value.
 */
const LEGACY_V1_RUNTIME_ALLOWLIST = [];
const STATIC_APPROVAL_ALLOWLIST = [];

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function isRuntimeSource(relativePath) {
  const normalized = normalizePath(relativePath);
  if (!normalized.startsWith("src/")) return false;
  if (/\.(?:test|spec|stories)\.[cm]?[jt]sx?$/.test(normalized)) return false;
  if (normalized.includes("/__tests__/") || normalized.startsWith("src/test/")) return false;
  return SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

function walkSourceFiles(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(absolutePath, output);
      continue;
    }
    const relativePath = path.relative(ROOT, absolutePath);
    if (isRuntimeSource(relativePath)) output.push(relativePath);
  }
  return output.sort((left, right) => normalizePath(left).localeCompare(normalizePath(right)));
}

function scriptKindFor(filePath) {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".js")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function parseSources(sourceTextByPath) {
  const parsed = new Map();
  for (const [relativePath, sourceText] of sourceTextByPath) {
    const normalized = normalizePath(relativePath);
    parsed.set(
      normalized,
      ts.createSourceFile(normalized, sourceText, ts.ScriptTarget.Latest, true, scriptKindFor(normalized)),
    );
  }
  return parsed;
}

function propertyNameText(name) {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function unwrapStaticExpression(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function collectStaticValues(sourceFile) {
  const values = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const value = staticPrimitive(declaration.initializer, values);
      if (typeof value === "string" || typeof value === "boolean") values.set(declaration.name.text, value);
    }
  }
  return values;
}

function staticString(expression, constants) {
  expression = unwrapStaticExpression(expression);
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isIdentifier(expression)) {
    const value = constants.get(expression.text);
    return typeof value === "string" ? value : null;
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticString(expression.left, constants);
    const right = staticString(expression.right, constants);
    return left === null || right === null ? null : `${left}${right}`;
  }
  return null;
}

function staticPrimitive(expression, constants) {
  expression = unwrapStaticExpression(expression);
  const text = staticString(expression, constants);
  if (text !== null) return text;
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isIdentifier(expression)) {
    const value = constants.get(expression.text);
    return typeof value === "string" || typeof value === "boolean" ? value : null;
  }
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    const value = constants.get(`${expression.expression.text}.${expression.name.text}`);
    return typeof value === "string" || typeof value === "boolean" ? value : null;
  }
  return null;
}

function routeText(expression, constants) {
  const fixed = staticString(expression, constants);
  if (fixed !== null) return fixed;
  if (ts.isTemplateExpression(expression)) {
    let value = expression.head.text;
    for (const span of expression.templateSpans) {
      value += `{${span.expression.getText()}}${span.literal.text}`;
    }
    for (const [name, replacement] of constants) {
      if (typeof replacement === "string") value = value.replaceAll(`{${name}}`, replacement);
    }
    return value;
  }
  return null;
}

function callName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function fetchMutationMethod(call) {
  if (call.arguments.length < 2 || !ts.isObjectLiteralExpression(call.arguments[1])) return null;
  for (const property of call.arguments[1].properties) {
    if (!ts.isPropertyAssignment(property) || propertyNameText(property.name) !== "method") continue;
    const method = staticString(property.initializer, new Map());
    if (!method) return null;
    const normalized = method.toUpperCase();
    return normalized === "GET" || normalized === "HEAD" ? null : normalized.toLowerCase();
  }
  return null;
}

function mutationRouteFromCall(call, constants) {
  const helper = callName(call.expression);
  if (!helper || call.arguments.length === 0) return null;
  let transport = null;
  if (MUTATION_HELPERS.has(helper)) transport = helper;
  if (helper === "fetch") transport = fetchMutationMethod(call);
  if (!transport) return null;
  const route = routeText(call.arguments[0], constants);
  if (!route || !route.includes(V1_PREFIX)) return null;
  return { route, transport };
}

function hasExportModifier(node) {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function collectFunctions(sourceFile) {
  const functions = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      functions.set(statement.name.text, {
        name: statement.name.text,
        node: statement,
        exported: hasExportModifier(statement),
      });
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    const exported = hasExportModifier(statement);
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
      ) {
        functions.set(declaration.name.text, {
          name: declaration.name.text,
          node: declaration.initializer,
          exported,
        });
      }
    }
  }
  return functions;
}

function visit(node, callback) {
  callback(node);
  node.forEachChild((child) => visit(child, callback));
}

function collectApiMetadata(parsedSources) {
  const metadata = new Map();
  for (const [relativePath, sourceFile] of parsedSources) {
    if (relativePath !== "src/api.ts" && !relativePath.startsWith("src/api/")) continue;
    const constants = collectStaticValues(sourceFile);
    const functions = collectFunctions(sourceFile);
    const imports = collectRuntimeImports(sourceFile, parsedSources);
    const exports = new Map();
    const allExports = new Map();
    const reExportAll = [];
    const reExportNamed = new Map();
    for (const descriptor of functions.values()) {
      if (!descriptor.exported) continue;
      allExports.set(descriptor.name, descriptor);
      const routes = [];
      visit(descriptor.node, (node) => {
        if (!ts.isCallExpression(node)) return;
        const route = mutationRouteFromCall(node, constants);
        if (route) routes.push(route);
      });
      if (routes.length > 0) exports.set(descriptor.name, { ...descriptor, routes });
    }
    for (const statement of sourceFile.statements) {
      if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) continue;
      if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const resolved = resolveRelativeImport(relativePath, statement.moduleSpecifier.text, parsedSources);
      if (!resolved) continue;
      if (!statement.exportClause) {
        reExportAll.push(resolved);
        continue;
      }
      if (!ts.isNamedExports(statement.exportClause)) continue;
      for (const element of statement.exportClause.elements) {
        if (element.isTypeOnly) continue;
        reExportNamed.set(element.name.text, {
          apiFile: resolved,
          exportName: element.propertyName?.text ?? element.name.text,
        });
      }
    }
    metadata.set(relativePath, { constants, imports, exports, allExports, functions, reExportAll, reExportNamed });
  }
  return metadata;
}

function resolveApiExport(apiFile, exportName, exportMapName, apiMetadata, visited = new Set()) {
  const visitKey = `${apiFile}:${exportMapName}:${exportName}`;
  if (visited.has(visitKey)) return null;
  visited.add(visitKey);
  const api = apiMetadata.get(apiFile);
  if (!api) return null;
  const direct = api[exportMapName].get(exportName);
  if (direct) return { apiFile, exportName, endpoint: direct };
  const named = api.reExportNamed.get(exportName);
  if (named) {
    const resolved = resolveApiExport(named.apiFile, named.exportName, exportMapName, apiMetadata, visited);
    if (resolved) return resolved;
  }
  for (const sourceApiFile of api.reExportAll) {
    const resolved = resolveApiExport(sourceApiFile, exportName, exportMapName, apiMetadata, visited);
    if (resolved) return resolved;
  }
  return null;
}

function resolveApiStaticValue(apiFile, exportName, apiMetadata, visited = new Set()) {
  const visitKey = `${apiFile}:${exportName}`;
  if (visited.has(visitKey)) return null;
  visited.add(visitKey);
  const api = apiMetadata.get(apiFile);
  if (!api) return null;

  const direct = api.constants.get(exportName);
  if (typeof direct === "string" || typeof direct === "boolean") return direct;

  const imported = api.imports.get(exportName);
  if (imported && !imported.namespace) {
    const resolved = resolveApiStaticValue(imported.apiFile, imported.exportName, apiMetadata, visited);
    if (resolved !== null) return resolved;
  }

  const named = api.reExportNamed.get(exportName);
  if (named) {
    const resolved = resolveApiStaticValue(named.apiFile, named.exportName, apiMetadata, visited);
    if (resolved !== null) return resolved;
  }
  for (const sourceApiFile of api.reExportAll) {
    const resolved = resolveApiStaticValue(sourceApiFile, exportName, apiMetadata, visited);
    if (resolved !== null) return resolved;
  }
  return null;
}

function collectApiStaticExports(apiFile, apiMetadata, visited = new Set()) {
  if (visited.has(apiFile)) return new Map();
  visited.add(apiFile);
  const api = apiMetadata.get(apiFile);
  if (!api) return new Map();
  const values = new Map(api.constants);

  for (const [exportName, target] of api.reExportNamed) {
    const value = resolveApiStaticValue(target.apiFile, target.exportName, apiMetadata);
    if (value !== null) values.set(exportName, value);
  }
  for (const sourceApiFile of api.reExportAll) {
    for (const [exportName, value] of collectApiStaticExports(sourceApiFile, apiMetadata, visited)) {
      if (!values.has(exportName)) values.set(exportName, value);
    }
  }
  return values;
}

function collectEffectiveApiStaticValues(apiFile, apiMetadata) {
  const api = apiMetadata.get(apiFile);
  const values = new Map(api?.constants ?? []);
  for (const [localName, imported] of api?.imports ?? []) {
    if (imported.namespace) {
      for (const [exportName, value] of collectApiStaticExports(imported.apiFile, apiMetadata)) {
        values.set(`${localName}.${exportName}`, value);
      }
      continue;
    }
    if (values.has(localName)) continue;
    const resolved = resolveApiStaticValue(imported.apiFile, imported.exportName, apiMetadata);
    if (resolved !== null) values.set(localName, resolved);
  }
  return values;
}

function resolveRelativeImport(importer, moduleSpecifier, parsedSources) {
  if (!moduleSpecifier.startsWith(".")) return null;
  const importerDirectory = path.posix.dirname(normalizePath(importer));
  const base = path.posix.normalize(path.posix.join(importerDirectory, moduleSpecifier));
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => `${base}/index${extension}`),
  ];
  return candidates.find((candidate) => parsedSources.has(candidate)) ?? null;
}

function collectRuntimeImports(sourceFile, parsedSources) {
  const imports = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const resolved = resolveRelativeImport(sourceFile.fileName, statement.moduleSpecifier.text, parsedSources);
    const bindings = statement.importClause?.namedBindings;
    if (!resolved || !bindings) continue;
    if (ts.isNamespaceImport(bindings)) {
      imports.set(bindings.name.text, {
        apiFile: resolved,
        namespace: true,
      });
      continue;
    }
    if (ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (element.isTypeOnly) continue;
        imports.set(element.name.text, {
          apiFile: resolved,
          exportName: element.propertyName?.text ?? element.name.text,
          namespace: false,
        });
      }
    }
  }
  return imports;
}

function isImportIdentifier(node) {
  return (
    ts.isImportSpecifier(node.parent) ||
    ts.isImportClause(node.parent) ||
    ts.isNamespaceImport(node.parent) ||
    ts.isImportEqualsDeclaration(node.parent)
  );
}

function collectRuntimeApiUsage(parsedSources, apiMetadata, exportMapName, includeDirectV1) {
  const usage = [];
  const direct = [];
  for (const [relativePath, sourceFile] of parsedSources) {
    if (relativePath === "src/api.ts" || relativePath.startsWith("src/api/")) continue;
    const constants = collectStaticValues(sourceFile);
    const imports = collectRuntimeImports(sourceFile, parsedSources);
    const counts = new Map();

    function recordImportedUsage(imported, exportName, kind) {
      const resolved = resolveApiExport(imported.apiFile, exportName, exportMapName, apiMetadata);
      if (!resolved || kind === "type") return;
      const { apiFile, exportName: resolvedExportName, endpoint } = resolved;
      const key = JSON.stringify({
        caller: relativePath,
        apiFile,
        exportName: resolvedExportName,
      });
      const current = counts.get(key) ?? {
        caller: relativePath,
        apiFile,
        exportName: resolvedExportName,
        calls: 0,
        references: 0,
        routes: endpoint.routes ?? [],
      };
      if (kind === "call") current.calls += 1;
      else current.references += 1;
      counts.set(key, current);
    }

    visit(sourceFile, (node) => {
      if (includeDirectV1 && ts.isCallExpression(node)) {
        const directRoute = mutationRouteFromCall(node, constants);
        if (directRoute) {
          direct.push({
            caller: relativePath,
            route: directRoute.route,
            transport: directRoute.transport,
          });
        }
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        imports.get(node.expression.text)?.namespace
      ) {
        const imported = imports.get(node.expression.text);
        const kind =
          ts.isCallExpression(node.parent) && node.parent.expression === node
            ? "call"
            : ts.isTypeNode(node.parent)
              ? "type"
              : "reference";
        recordImportedUsage(imported, node.name.text, kind);
        return;
      }
      if (!ts.isIdentifier(node) || isImportIdentifier(node)) return;
      const imported = imports.get(node.text);
      if (!imported || imported.namespace) return;
      const kind =
        ts.isCallExpression(node.parent) && node.parent.expression === node
          ? "call"
          : ts.isTypeNode(node.parent)
            ? "type"
            : "reference";
      recordImportedUsage(imported, imported.exportName, kind);
    });

    usage.push(...counts.values());
  }
  return { usage, direct };
}

function calledLocalFunctions(node, localFunctions) {
  const names = new Set();
  visit(node, (child) => {
    if (!ts.isCallExpression(child) || !ts.isIdentifier(child.expression)) return;
    if (localFunctions.has(child.expression.text)) names.add(child.expression.text);
  });
  return names;
}

function bindingNameContains(bindingName, target) {
  if (ts.isIdentifier(bindingName)) return bindingName.text === target;
  return bindingName.elements.some(
    (element) => ts.isBindingElement(element) && bindingNameContains(element.name, target),
  );
}

function resolveStaticIdentifierAt(name, position, constants, resolving) {
  const resolutionKey = `${position.getSourceFile().fileName}:${position.pos}:${name}`;
  if (resolving.has(resolutionKey)) return null;
  const nextResolving = new Set(resolving);
  nextResolving.add(resolutionKey);

  let current = position.parent;
  while (current) {
    if (
      ts.isFunctionLike(current) &&
      current.parameters.some((parameter) => bindingNameContains(parameter.name, name))
    ) {
      return null;
    }
    if (ts.isCatchClause(current) && current.variableDeclaration) {
      if (bindingNameContains(current.variableDeclaration.name, name)) return null;
    }
    if (ts.isBlock(current) || ts.isSourceFile(current)) {
      for (const statement of current.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
          if (!bindingNameContains(declaration.name, name)) continue;
          if (!ts.isIdentifier(declaration.name) || !declaration.initializer) return null;
          return resolveStaticExpressionAt(declaration.initializer, declaration, constants, nextResolving);
        }
      }
    }
    current = current.parent;
  }

  const value = constants.get(name);
  return typeof value === "string" || typeof value === "boolean" ? value : null;
}

function resolveStaticExpressionAt(expression, position, constants, resolving = new Set()) {
  expression = unwrapStaticExpression(expression);
  if (ts.isIdentifier(expression)) {
    return resolveStaticIdentifierAt(expression.text, position, constants, resolving);
  }
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    const value = constants.get(`${expression.expression.text}.${expression.name.text}`);
    return typeof value === "string" || typeof value === "boolean" ? value : null;
  }
  if (ts.isElementAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    const member = expression.argumentExpression ? staticString(expression.argumentExpression, constants) : null;
    const value = member === null ? null : constants.get(`${expression.expression.text}.${member}`);
    return typeof value === "string" || typeof value === "boolean" ? value : null;
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = resolveStaticExpressionAt(expression.left, position, constants, resolving);
    const right = resolveStaticExpressionAt(expression.right, position, constants, resolving);
    return typeof left === "string" && typeof right === "string" ? `${left}${right}` : null;
  }
  if (ts.isTemplateExpression(expression)) {
    let value = expression.head.text;
    for (const span of expression.templateSpans) {
      const fixed = resolveStaticExpressionAt(span.expression, position, constants, resolving);
      if (typeof fixed !== "string" && typeof fixed !== "boolean") return null;
      value += `${String(fixed)}${span.literal.text}`;
    }
    return value;
  }
  return staticPrimitive(expression, constants);
}

function collectStaticApprovalProperties(node, constants) {
  const properties = [];

  visit(node, (child) => {
    if (ts.isShorthandPropertyAssignment(child)) {
      const property = child.name.text;
      if (!APPROVAL_KEYS.has(property)) return;
      const shorthandValue = resolveStaticIdentifierAt(property, child, constants, new Set());
      if (typeof shorthandValue === "string" || typeof shorthandValue === "boolean") {
        properties.push({ property, value: String(shorthandValue) });
      }
      return;
    }

    if (!ts.isPropertyAssignment(child)) return;
    const property = propertyNameText(child.name);
    if (!property || !APPROVAL_KEYS.has(property)) return;
    const value = resolveStaticExpressionAt(child.initializer, child, constants);
    if (typeof value === "string" || typeof value === "boolean") {
      properties.push({ property, value: String(value) });
    }
  });
  return properties;
}

function collectStaticApprovalUsage(parsedSources, apiMetadata, runtimeUsage) {
  const findings = [];
  const entriesByApi = new Map();
  for (const entry of runtimeUsage) {
    const entries = entriesByApi.get(entry.apiFile) ?? [];
    entries.push(entry);
    entriesByApi.set(entry.apiFile, entries);
  }

  for (const [apiFile, entries] of entriesByApi) {
    const api = apiMetadata.get(apiFile);
    if (!api) continue;
    const constants = collectEffectiveApiStaticValues(apiFile, apiMetadata);
    for (const entry of entries) {
      const queue = [entry.exportName];
      const visited = new Set();
      while (queue.length > 0) {
        const owner = queue.shift();
        if (!owner || visited.has(owner)) continue;
        visited.add(owner);
        const descriptor = api.functions.get(owner);
        if (!descriptor) continue;
        for (const property of collectStaticApprovalProperties(descriptor.node, constants)) {
          findings.push({
            entryExport: entry.exportName,
            file: apiFile,
            owner,
            property: property.property,
            value: property.value,
          });
        }
        queue.push(...calledLocalFunctions(descriptor.node, api.functions));
      }
    }
  }

  for (const [relativePath, sourceFile] of parsedSources) {
    if (relativePath === "src/api.ts" || relativePath.startsWith("src/api/")) continue;
    const constants = collectStaticValues(sourceFile);
    for (const property of collectStaticApprovalProperties(sourceFile, constants)) {
      findings.push({
        entryExport: null,
        file: relativePath,
        owner: "<runtime-module>",
        property: property.property,
        value: property.value,
      });
    }
  }

  return findings;
}

function runtimeKey(entry) {
  const routes = entry.routes
    .map((route) => `${route.transport}:${route.route}`)
    .sort()
    .join(",");
  return `${entry.caller}|${entry.apiFile}|${entry.exportName}|${routes}`;
}

function staticApprovalKey(entry) {
  return `${entry.file}|${entry.entryExport ?? "-"}|${entry.owner}|${entry.property}|${entry.value}`;
}

function enforceCeiling(observed, allowlist, keyFor, countFor, label) {
  const allowed = new Map(allowlist.map((entry) => [keyFor(entry), entry.maxCount]));
  const totals = new Map();
  for (const entry of observed) {
    const key = keyFor(entry);
    totals.set(key, (totals.get(key) ?? 0) + countFor(entry));
  }
  const violations = [];
  for (const [key, count] of totals) {
    const maximum = allowed.get(key);
    if (maximum === undefined) violations.push(`${label}:not-allowlisted:${key}:observed=${count}`);
    else if (count > maximum) violations.push(`${label}:ceiling-exceeded:${key}:observed=${count}:max=${maximum}`);
  }
  return violations;
}

export function analyzeSources(sourceTextByPath, options = {}) {
  const parsedSources = parseSources(sourceTextByPath);
  const apiMetadata = collectApiMetadata(parsedSources);
  const runtime = collectRuntimeApiUsage(parsedSources, apiMetadata, "exports", true);
  const allRuntime = collectRuntimeApiUsage(parsedSources, apiMetadata, "allExports", false);
  const staticApprovals = collectStaticApprovalUsage(parsedSources, apiMetadata, allRuntime.usage);
  const runtimeAllowlist = options.runtimeAllowlist ?? LEGACY_V1_RUNTIME_ALLOWLIST;
  const staticAllowlist = options.staticAllowlist ?? STATIC_APPROVAL_ALLOWLIST;
  const violations = [
    ...runtime.direct.map(
      (entry) => `legacy-v1-direct-runtime-mutation:${entry.caller}:${entry.transport}:${entry.route}`,
    ),
    ...enforceCeiling(
      runtime.usage,
      runtimeAllowlist,
      runtimeKey,
      (entry) => entry.calls + entry.references,
      "legacy-v1-runtime-usage",
    ),
    ...enforceCeiling(staticApprovals, staticAllowlist, staticApprovalKey, () => 1, "static-approval"),
  ];
  return { ...runtime, staticApprovals, violations };
}

function scanForbiddenUnicode(text, label) {
  const findings = [];
  let line = 1;
  let column = 1;
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    const forbidden = FORBIDDEN_UNICODE_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end);
    if (forbidden) {
      findings.push(`${label}:${line}:${column}:U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`);
    }
    if (character === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return findings;
}

function scanWorkflowUnicode(workflowFiles) {
  return workflowFiles.flatMap((workflowFile) =>
    scanForbiddenUnicode(fs.readFileSync(workflowFile, "utf8"), normalizePath(path.relative(ROOT, workflowFile))),
  );
}

function workflowRunText(job) {
  if (!job || !Array.isArray(job.steps)) return "";
  return job.steps.map((step) => (typeof step?.run === "string" ? step.run : "")).join("\n");
}

function validateWorkflow() {
  const workflowDirectory = path.join(ROOT, ".github", "workflows");
  const workflowFiles = fs
    .readdirSync(workflowDirectory)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => path.join(workflowDirectory, name));
  const unicodeFindings = scanWorkflowUnicode(workflowFiles);
  assert.deepEqual(unicodeFindings, [], `Forbidden hidden/bidi Unicode:\n${unicodeFindings.join("\n")}`);

  const ciPath = path.join(workflowDirectory, "ci.yml");
  let ciDocument = null;
  for (const workflowFile of workflowFiles) {
    const document = YAML.parseDocument(fs.readFileSync(workflowFile, "utf8"));
    const relativePath = normalizePath(path.relative(ROOT, workflowFile));
    assert.equal(
      document.errors.length,
      0,
      `${relativePath}:\n${document.errors.map((error) => error.message).join("\n")}`,
    );
    if (path.resolve(workflowFile) === path.resolve(ciPath)) ciDocument = document;
  }
  assert.ok(ciDocument, ".github/workflows/ci.yml is required");
  const workflow = ciDocument.toJS();
  const linux = workflowRunText(workflow.jobs?.["v1-contract"]);
  const windows = workflowRunText(workflow.jobs?.["windows-candidate"]);
  const sharedRequirements = [
    "tsconfig.app.json",
    "tsconfig.node.json",
    "server/modules/routes/ops/control-plane-v2-runtime.test.ts",
    "server/modules/control-plane/projection-service.test.ts",
    "server/modules/routes/ops/control-tower.test.ts",
    "server/modules/release/release-identity.test.ts",
    "server/modules/control-plane/certification-contract.test.ts",
    "v1:release-identity",
    "v1:certification-contract:self-test",
    "master95:delivery",
    "v1:ci-gate",
    "v1:ci-gate:self-test",
  ];
  for (const [lane, runText] of [
    ["v1-contract", linux],
    ["windows-candidate", windows],
  ]) {
    for (const requirement of sharedRequirements) {
      assert.ok(runText.includes(requirement), `${lane} is missing ${requirement}`);
    }
  }
}

function runSelfTest() {
  assert.equal(LEGACY_V1_RUNTIME_ALLOWLIST.length, 0, "legacy v1 runtime ceiling must remain zero");
  assert.equal(STATIC_APPROVAL_ALLOWLIST.length, 0, "static approval ceiling must remain zero");

  const baseSources = new Map([
    [
      "src/api/legacy.ts",
      `
        const BASE = "/api/control-plane/v1";
        const FIXED = "DO_NOT_AUTO_FILL";
        declare function post<T>(route: string, body: unknown): Promise<T>;
        export function unusedDeprecated() {
          return post(\`\${BASE}/unused\`, { confirm: FIXED });
        }
        export function usedLegacy() {
          return post(\`\${BASE}/used\`, { confirmation_text: FIXED });
        }
        export function safeV2(confirmationText: string) {
          return post("/api/control-plane/v2/used", { confirmation_text: confirmationText });
        }
      `,
    ],
    [
      "src/components/Panel.tsx",
      `
        import { usedLegacy } from "../api/legacy";
        export function Panel() {
          void usedLegacy();
          return null;
        }
      `,
    ],
  ]);

  const observed = analyzeSources(baseSources, { runtimeAllowlist: [], staticAllowlist: [] });
  assert.equal(observed.usage.length, 1, "unused deprecated definitions must not count as runtime usage");
  assert.ok(observed.violations.some((item) => item.startsWith("legacy-v1-runtime-usage:not-allowlisted")));
  assert.ok(observed.violations.some((item) => item.startsWith("static-approval:not-allowlisted")));
  const defaultFrozenCeiling = analyzeSources(baseSources);
  assert.ok(defaultFrozenCeiling.violations.some((item) => item.startsWith("legacy-v1-runtime-usage:not-allowlisted")));
  assert.ok(defaultFrozenCeiling.violations.some((item) => item.startsWith("static-approval:not-allowlisted")));

  const allowed = analyzeSources(baseSources, {
    runtimeAllowlist: observed.usage.map((entry) => ({ ...entry, maxCount: entry.calls + entry.references })),
    staticAllowlist: observed.staticApprovals.map((entry) => ({ ...entry, maxCount: 1 })),
  });
  assert.deepEqual(allowed.violations, []);

  const directMutation = new Map(baseSources);
  directMutation.set(
    "src/components/Direct.tsx",
    `export function direct() {
      return fetch("/api/control-plane/v1/new-mutation", { method: "POST", body: "{}" });
    }`,
  );
  const directResult = analyzeSources(directMutation, {
    runtimeAllowlist: observed.usage.map((entry) => ({ ...entry, maxCount: entry.calls + entry.references })),
    staticAllowlist: observed.staticApprovals.map((entry) => ({ ...entry, maxCount: 1 })),
  });
  assert.ok(directResult.violations.some((item) => item.startsWith("legacy-v1-direct-runtime-mutation")));

  const namespaceMutation = new Map(baseSources);
  namespaceMutation.set(
    "src/components/Namespace.tsx",
    `import * as legacy from "../api/legacy";
     export function Namespace() { void legacy.usedLegacy(); return null; }`,
  );
  const namespaceResult = analyzeSources(namespaceMutation, {
    runtimeAllowlist: observed.usage.map((entry) => ({ ...entry, maxCount: entry.calls + entry.references })),
    staticAllowlist: observed.staticApprovals.map((entry) => ({ ...entry, maxCount: 1 })),
  });
  assert.ok(namespaceResult.violations.some((item) => item.startsWith("legacy-v1-runtime-usage:not-allowlisted")));

  const barrelMutation = new Map([
    [
      "src/api/approval-constants.ts",
      `
        export const confirm = true as const;
        export const FIXED = true as const;
      `,
    ],
    [
      "src/api/legacy.ts",
      `
        import { confirm, FIXED } from "./approval-constants";
        import * as approval from "./approval-constants";
        declare function post<T>(route: string, body: unknown): Promise<T>;
        export function usedLegacy() {
          return post("/api/control-plane/v1/used", {});
        }
        export function booleanApproval() {
          return post("/api/skills/refresh", { confirm });
        }
        export function localBooleanApproval() {
          const confirm = false as const;
          return post("/api/skills/install", { confirm });
        }
        export function importedAliasApproval() {
          return post("/api/skills/imported", { confirm: FIXED });
        }
        export function namespaceApproval() {
          return post("/api/skills/namespace", { confirm: approval.confirm });
        }
        export function localAliasApproval() {
          const fixed = true;
          return post("/api/skills/local-alias", { confirm: fixed });
        }
      `,
    ],
    ["src/api.ts", `export * from "./api/legacy";`],
    [
      "src/components/Barrel.tsx",
      `
        import {
          booleanApproval,
          importedAliasApproval,
          localAliasApproval,
          localBooleanApproval,
          namespaceApproval,
          usedLegacy,
        } from "../api";
        export function Barrel() {
          void usedLegacy();
          void booleanApproval();
          void localBooleanApproval();
          void importedAliasApproval();
          void namespaceApproval();
          void localAliasApproval();
          return null;
        }
      `,
    ],
  ]);
  const barrelResult = analyzeSources(barrelMutation, { runtimeAllowlist: [], staticAllowlist: [] });
  assert.equal(barrelResult.usage.length, 1, "export-star barrels must preserve v1 mutation usage");
  assert.ok(barrelResult.violations.some((item) => item.startsWith("legacy-v1-runtime-usage:not-allowlisted")));
  assert.ok(
    barrelResult.staticApprovals.some((item) => item.property === "confirm" && item.value === "true"),
    "boolean fixed approvals imported through a barrel must be detected",
  );
  for (const owner of [
    "booleanApproval",
    "localBooleanApproval",
    "importedAliasApproval",
    "namespaceApproval",
    "localAliasApproval",
  ]) {
    assert.ok(
      barrelResult.staticApprovals.some((item) => item.owner === owner),
      `${owner} must be detected as a fixed approval`,
    );
  }
  assert.ok(barrelResult.violations.some((item) => item.startsWith("static-approval:not-allowlisted")));

  const safeOnly = new Map([
    ["src/api/approval-constants.ts", `export const confirm = true as const;`],
    [
      "src/api/v2.ts",
      `import { confirm } from "./approval-constants";
       declare function post<T>(route: string, body: unknown): Promise<T>;
       export function execute(confirmation_text: string) {
         return post("/api/control-plane/v2/mutations/execute", { confirmation_text });
       }
       export function executeDestructured({ confirm }: { confirm: boolean }) {
         return post("/api/control-plane/v2/mutations/execute", { confirm });
       }`,
    ],
    [
      "src/components/V2.tsx",
      `import { execute, executeDestructured } from "../api/v2";
       export function V2({ value, confirm }: { value: string; confirm: boolean }) {
         void execute(value);
         void executeDestructured({ confirm });
         return null;
       }`,
    ],
  ]);
  assert.deepEqual(analyzeSources(safeOnly, { runtimeAllowlist: [], staticAllowlist: [] }).violations, []);
  assert.equal(scanForbiddenUnicode("safe\u202Eunsafe", "fixture.yml").length, 1);
  assert.equal(YAML.parseDocument("jobs:\n  test:\n    runs-on: ubuntu-latest\n").errors.length, 0);
  assert.ok(YAML.parseDocument("jobs:\n  test: [\n").errors.length > 0);
  process.stdout.write("[v1-ci-gate] self-test passed\n");
}

function runRepositoryGate() {
  if (!process.argv.includes("--source-only")) validateWorkflow();
  const sourceTextByPath = new Map(
    walkSourceFiles(path.join(ROOT, "src")).map((relativePath) => [
      normalizePath(relativePath),
      fs.readFileSync(path.join(ROOT, relativePath), "utf8"),
    ]),
  );
  const result = analyzeSources(sourceTextByPath);
  if (process.argv.includes("--print-observed")) {
    process.stdout.write(
      `${JSON.stringify({ usage: result.usage, staticApprovals: result.staticApprovals }, null, 2)}\n`,
    );
  }
  if (result.violations.length > 0) {
    process.stderr.write("[v1-ci-gate] violations\n");
    for (const violation of result.violations) process.stderr.write(`- ${violation}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `[v1-ci-gate] passed: legacy_runtime_usages=${result.usage.length}, static_approval_sites=${result.staticApprovals.length}\n`,
  );
}

if (process.argv.includes("--self-test")) runSelfTest();
else runRepositoryGate();

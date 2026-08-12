#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import SwaggerParser from "@apidevtools/swagger-parser";
import prettier from "prettier";

const OPENAPI_PATH = path.resolve(process.cwd(), "docs", "openapi.json");
const PACKAGE_JSON_PATH = path.resolve(process.cwd(), "package.json");
const MODE = process.argv.includes("--write") ? "write" : "check";

const METHODS = ["get", "post", "put", "patch", "delete"];
const DISCOVERED_ROUTE_FILES = [
  "server/modules/routes/ops/control-plane.ts",
  "server/modules/routes/ops/control-tower.ts",
  "server/modules/routes/ops/image-workbench.ts",
];
const PUBLIC_API_PATHS = new Set(["/api/health", "/api/auth/session", "/api/openapi.json"]);
const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"]);
const JSON_MEDIA_TYPES = ["application/json"];
const CONFLICT_RESPONSE_EXCLUSIONS = new Set(["POST /api/messenger/discord/channels"]);

const STANDARD_ERROR_RESPONSE_REFS = {
  401: "#/components/responses/UnauthorizedError",
  403: "#/components/responses/ForbiddenError",
  409: "#/components/responses/ConflictError",
  429: "#/components/responses/TooManyRequestsError",
  500: "#/components/responses/InternalServerError",
};

const REQUEST_EXAMPLE_OVERRIDES = {
  "POST /api/departments": {
    id: "planning2",
    name: "Planning II",
    icon: "🧭",
    color: "#6b7280",
  },
  "POST /api/agents": {
    name: "Alex",
    department_id: "planning",
    role: "team_leader",
    cli_provider: "claude",
  },
  "POST /api/tasks": {
    title: "Fix CI OpenAPI contract check",
    description: "Add OpenAPI validation and sync gate in CI",
    priority: 2,
    status: "inbox",
    task_type: "general",
  },
  "PATCH /api/tasks/{id}": {
    status: "in_progress",
    priority: 3,
  },
  "POST /api/tasks/{id}/run": {
    agent_id: "agent_001",
  },
  "POST /api/tasks/{id}/stop": {
    mode: "cancel",
  },
  "POST /api/messages": {
    sender_type: "ceo",
    receiver_type: "agent",
    receiver_id: "agent_001",
    message_type: "chat",
    content: "Please start implementation.",
  },
  "POST /api/inbox": {
    source: "telegram",
    text: "$Fix build failure on main",
    author: "CEO",
    project_id: "project_001",
    project_path: "/workspace/my-project",
    project_context: "Stabilize release pipeline",
  },
  "PUT /api/settings": {
    ceoName: "CEO",
    language: "ko",
  },
  "POST /api/projects": {
    name: "my-project",
    project_path: "/workspace/my-project",
    core_goal: "Ship MVP with CI stabilization",
  },
  "POST /api/decision-inbox/{id}/reply": {
    option_number: 1,
    note: "Proceed with this option.",
  },
};

const RESPONSE_EXAMPLE_OVERRIDES = {
  "GET /api/health 200": {
    ok: true,
    status: "healthy",
    version: readPackageVersion(),
    app: "DonggriCompany",
    dbPath: "/workspace/donggri-company.sqlite",
  },
  "GET /api/auth/session 200": {
    ok: true,
  },
  "GET /api/tasks 200": {
    tasks: [
      {
        id: "task_001",
        title: "Fix build",
        status: "inbox",
      },
    ],
  },
  "POST /api/tasks 200": {
    id: "task_001",
    task: {
      id: "task_001",
      title: "Fix CI OpenAPI contract check",
      status: "inbox",
    },
  },
  "POST /api/inbox 200": {
    ok: true,
    id: "msg_001",
    directive: true,
  },
  "GET /api/openapi.json 200": {
    openapi: "3.0.3",
    info: {
      title: "DonggriCompany API",
      version: readPackageVersion(),
    },
  },
};

function readPackageVersion() {
  try {
    const raw = fs.readFileSync(PACKAGE_JSON_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed.version === "string" && parsed.version.trim() ? parsed.version.trim() : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function normalizeNullableType(schema) {
  if (!schema || typeof schema !== "object") return;
  if (!Array.isArray(schema.type)) return;

  const uniqueTypes = [...new Set(schema.type.filter((item) => typeof item === "string"))];
  if (!uniqueTypes.includes("null")) return;

  const concreteTypes = uniqueTypes.filter((item) => item !== "null");
  if (concreteTypes.length === 1) {
    schema.type = concreteTypes[0];
    schema.nullable = true;
    return;
  }

  if (concreteTypes.length > 1) {
    schema.oneOf = concreteTypes.map((type) => ({ type }));
    delete schema.type;
    schema.nullable = true;
  }
}

function walkSchemaTree(schema, visitor) {
  if (!schema || typeof schema !== "object") return;
  visitor(schema);

  if (schema.properties && typeof schema.properties === "object") {
    for (const value of Object.values(schema.properties)) {
      walkSchemaTree(value, visitor);
    }
  }

  if (schema.items && typeof schema.items === "object") {
    walkSchemaTree(schema.items, visitor);
  }

  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    walkSchemaTree(schema.additionalProperties, visitor);
  }

  for (const key of ["oneOf", "allOf", "anyOf"]) {
    if (!Array.isArray(schema[key])) continue;
    for (const child of schema[key]) {
      walkSchemaTree(child, visitor);
    }
  }
}

function normalizeNullableTypes(doc) {
  if (doc.components?.schemas && typeof doc.components.schemas === "object") {
    for (const schema of Object.values(doc.components.schemas)) {
      walkSchemaTree(schema, normalizeNullableType);
    }
  }

  for (const pathItem of Object.values(doc.paths ?? {})) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const method of METHODS) {
      const operation = pathItem[method];
      if (!operation || typeof operation !== "object") continue;

      const requestBodyContent = operation.requestBody?.content;
      if (requestBodyContent && typeof requestBodyContent === "object") {
        for (const media of Object.values(requestBodyContent)) {
          if (media?.schema && typeof media.schema === "object") {
            walkSchemaTree(media.schema, normalizeNullableType);
          }
        }
      }

      for (const response of Object.values(operation.responses ?? {})) {
        if (!response || typeof response !== "object" || !response.content) continue;
        for (const media of Object.values(response.content)) {
          if (media?.schema && typeof media.schema === "object") {
            walkSchemaTree(media.schema, normalizeNullableType);
          }
        }
      }
    }
  }
}

function exitWithError(message) {
  console.error(`[openapi] ${message}`);
  process.exit(1);
}

function loadOpenApiFile() {
  if (!fs.existsSync(OPENAPI_PATH)) {
    exitWithError(`OpenAPI file not found: ${OPENAPI_PATH}`);
  }
  const raw = fs.readFileSync(OPENAPI_PATH, "utf8");
  try {
    const doc = JSON.parse(raw);
    return { raw, doc };
  } catch (error) {
    exitWithError(
      `Invalid JSON in ${path.relative(process.cwd(), OPENAPI_PATH)}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function serializeDoc(doc) {
  const json = JSON.stringify(doc, null, 2);
  const prettierConfig = (await prettier.resolveConfig(OPENAPI_PATH)) ?? {};
  return prettier.format(json, {
    ...prettierConfig,
    filepath: OPENAPI_PATH,
  });
}

function inferStringExample(name = "") {
  const lower = name.toLowerCase();
  if (lower === "id" || lower.endsWith("_id")) return "string_id";
  if (lower.includes("path")) return "/workspace/project";
  if (lower.includes("url")) return "https://example.com";
  if (lower.includes("status")) return "ok";
  if (lower.includes("name")) return "string";
  if (lower.includes("title")) return "string";
  if (lower.includes("description")) return "string";
  if (lower.includes("content")) return "string";
  if (lower.includes("message")) return "string";
  if (lower.includes("created") || lower.includes("updated")) return "2026-02-26T00:00:00.000Z";
  return "string";
}

function resolveSchemaRef(schema, doc, seenRefs) {
  if (!schema || typeof schema !== "object" || typeof schema.$ref !== "string") return schema;
  const ref = schema.$ref;
  if (!ref.startsWith("#/")) return null;
  if (seenRefs.has(ref)) return null;
  seenRefs.add(ref);
  const parts = ref.slice(2).split("/");
  let current = doc;
  for (const part of parts) {
    if (!current || typeof current !== "object") return null;
    current = current[part];
  }
  return current && typeof current === "object" ? current : null;
}

function inferExampleFromSchema(schema, doc, propertyName = "", seenRefs = new Set(), depth = 0) {
  if (!schema || typeof schema !== "object") return null;
  if (depth > 5) return null;

  if (schema.example !== undefined) return schema.example;

  if (schema.$ref) {
    const resolved = resolveSchemaRef(schema, doc, seenRefs);
    if (!resolved) return null;
    return inferExampleFromSchema(resolved, doc, propertyName, seenRefs, depth + 1);
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  if (Array.isArray(schema.type)) {
    const concrete = schema.type.find((item) => item !== "null") ?? schema.type[0];
    return inferExampleFromSchema({ ...schema, type: concrete }, doc, propertyName, seenRefs, depth + 1);
  }

  switch (schema.type) {
    case "string": {
      if (schema.format === "date-time") return "2026-02-26T00:00:00.000Z";
      if (schema.format === "date") return "2026-02-26";
      if (schema.format === "uri") return "https://example.com";
      return inferStringExample(propertyName);
    }
    case "integer":
      return 1;
    case "number":
      return 1;
    case "boolean":
      return true;
    case "array": {
      const itemExample = inferExampleFromSchema(schema.items, doc, propertyName, seenRefs, depth + 1);
      return itemExample === null ? [] : [itemExample];
    }
    case "object": {
      const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
      const required = Array.isArray(schema.required) ? new Set(schema.required) : new Set(Object.keys(properties));
      const out = {};
      for (const [key, value] of Object.entries(properties)) {
        if (!required.has(key) && required.size > 0) continue;
        const valueExample = inferExampleFromSchema(value, doc, key, seenRefs, depth + 1);
        if (valueExample !== null) out[key] = valueExample;
      }
      if (Object.keys(out).length > 0) return out;
      if (schema.additionalProperties) return { additionalProp1: "value" };
      return {};
    }
    default:
      return null;
  }
}

function ensureErrorResponseSchema(doc) {
  doc.components ??= {};
  doc.components.schemas ??= {};
  doc.components.schemas.ErrorResponse ??= {
    type: "object",
    properties: {
      error: { type: "string" },
      message: { type: "string" },
    },
    required: ["error"],
    additionalProperties: true,
  };
}

function ensureStandardErrorResponses(doc) {
  doc.components ??= {};
  doc.components.responses ??= {};

  const addResponse = (name, description, errorCode, message) => {
    doc.components.responses[name] ??= {
      description,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
          example: {
            error: errorCode,
            message,
          },
        },
      },
    };
  };

  addResponse("UnauthorizedError", "Unauthorized", "unauthorized", "Authentication is required.");
  addResponse("ForbiddenError", "Forbidden", "forbidden", "You do not have permission to access this resource.");
  addResponse("ConflictError", "Conflict", "conflict", "The request conflicts with current server state.");
  addResponse("TooManyRequestsError", "Too Many Requests", "too_many_requests", "Rate limit exceeded.");
  addResponse("InternalServerError", "Internal Server Error", "internal_error", "Unexpected server error.");
}

function ensureSecuritySchemes(doc) {
  doc.components ??= {};
  doc.components.securitySchemes ??= {};
  doc.components.securitySchemes.bearerAuth ??= {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
  };
  doc.components.securitySchemes.inboxSecret ??= {
    type: "apiKey",
    in: "header",
    name: "x-inbox-secret",
  };
  doc.components.securitySchemes.cookieAuth ??= {
    type: "apiKey",
    in: "cookie",
    name: "sid",
  };
  doc.components.securitySchemes.csrfHeader ??= {
    type: "apiKey",
    in: "header",
    name: "x-csrf-token",
    description: "Required for cookie-authenticated mutation requests.",
  };
}

function ensureLocalMutationOriginContract(pathname, method, operation, doc) {
  if (!pathname.startsWith("/api/control-plane/") || !MUTATING_METHODS.has(method)) return;
  doc.components ??= {};
  doc.components.parameters ??= {};
  doc.components.parameters.LocalControlPlaneMutationOrigin ??= {
    name: "Origin",
    in: "header",
    required: true,
    description: "Required for Control Plane mutations. Only local Dongri-grigri UI origins are accepted.",
    schema: {
      type: "string",
      enum: ["http://127.0.0.1:8800", "http://localhost:8800", "http://127.0.0.1:8810", "http://localhost:8810"],
    },
  };
  operation.parameters ??= [];
  const hasOriginParameter = operation.parameters.some((parameter) => {
    if (!parameter || typeof parameter !== "object") return false;
    if (parameter.$ref === "#/components/parameters/LocalControlPlaneMutationOrigin") return true;
    return (
      String(parameter.name ?? "").toLowerCase() === "origin" && String(parameter.in ?? "").toLowerCase() === "header"
    );
  });
  if (!hasOriginParameter) {
    operation.parameters.push({ $ref: "#/components/parameters/LocalControlPlaneMutationOrigin" });
  }
  const note =
    "Control Plane mutations are local UI only. Authentication alone is not sufficient; the request must include an allowed local Origin header.";
  const currentDescription = typeof operation.description === "string" ? operation.description : "";
  operation.description = currentDescription.includes(note)
    ? currentDescription
    : currentDescription
      ? `${currentDescription}\n\n${note}`
      : note;
}

function isProtectedOperation(pathname, method, operation, doc) {
  if (!pathname.startsWith("/api/")) return false;
  if (PUBLIC_API_PATHS.has(pathname)) return false;
  if (pathname === "/api/docs" || pathname.startsWith("/api/docs/")) return false;
  if (Array.isArray(operation.security)) return operation.security.length > 0;
  if (Array.isArray(doc.security)) return doc.security.length > 0;
  return true;
}

function ensureOperationSecurity(pathname, method, operation) {
  if (pathname === "/api/inbox") {
    if (!Array.isArray(operation.security) || operation.security.length === 0) {
      operation.security = [{ inboxSecret: [] }];
    }
    return;
  }
  if (MUTATING_METHODS.has(method)) {
    operation.security = [{ bearerAuth: [] }, { cookieAuth: [], csrfHeader: [] }];
    return;
  }
  if (!Array.isArray(operation.security)) {
    operation.security = [{ bearerAuth: [] }];
  }
}

function ensureOperationErrorResponses(pathname, method, operation, doc) {
  operation.responses ??= {};
  const needsSecurity = isProtectedOperation(pathname, method, operation, doc);
  if (needsSecurity) {
    for (const statusCode of ["401", "403", "429", "500"]) {
      if (!operation.responses[statusCode]) {
        operation.responses[statusCode] = { $ref: STANDARD_ERROR_RESPONSE_REFS[statusCode] };
      }
    }
  }
  const opKey = `${method.toUpperCase()} ${pathname}`;
  if (CONFLICT_RESPONSE_EXCLUSIONS.has(opKey)) {
    delete operation.responses["409"];
    return;
  }
  if (MUTATING_METHODS.has(method) && !operation.responses["409"]) {
    operation.responses["409"] = { $ref: STANDARD_ERROR_RESPONSE_REFS["409"] };
  }
}

function normalizeExpressPath(routePath) {
  return routePath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function discoverExpressRoutes() {
  const routes = new Map();
  for (const relativeFile of DISCOVERED_ROUTE_FILES) {
    const absoluteFile = path.resolve(process.cwd(), relativeFile);
    if (!fs.existsSync(absoluteFile)) continue;
    const raw = fs.readFileSync(absoluteFile, "utf8");
    const stringConstants = new Map(
      [...raw.matchAll(/\bconst\s+([A-Za-z0-9_]+)\s*=\s*["']([^"']+)["'];/g)].map((match) => [match[1], match[2]]),
    );
    const addRoute = (method, routePath) => {
      const constantPrefix = routePath.match(/^\$\{([A-Za-z0-9_]+)\}/);
      if (constantPrefix && stringConstants.has(constantPrefix[1])) {
        routePath = `${stringConstants.get(constantPrefix[1])}${routePath.slice(constantPrefix[0].length)}`;
      }
      if (!routePath.startsWith("/api/")) return;
      const normalizedPath = normalizeExpressPath(routePath);
      routes.set(`${method.toLowerCase()} ${normalizedPath}`, {
        method: method.toLowerCase(),
        pathname: normalizedPath,
        source_file: relativeFile,
      });
    };
    for (const match of raw.matchAll(/\bapp\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g)) {
      addRoute(match[1], match[2]);
    }
    for (const match of raw.matchAll(/\b(post|put|patch|del|delete)\.call\(\s*app\s*,\s*["'`]([^"'`]+)["'`]/g)) {
      addRoute(match[1] === "del" ? "delete" : match[1], match[2]);
    }
  }
  return [...routes.values()].sort((a, b) => `${a.pathname} ${a.method}`.localeCompare(`${b.pathname} ${b.method}`));
}

function ensurePathParameters(pathname, operation) {
  const names = [...pathname.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  if (names.length === 0) return;
  operation.parameters ??= [];
  for (const name of names) {
    const exists = operation.parameters.some((parameter) => {
      if (!parameter || typeof parameter !== "object" || parameter.$ref) return false;
      return parameter.name === name && parameter.in === "path";
    });
    if (!exists) {
      operation.parameters.push({
        name,
        in: "path",
        required: true,
        schema: {
          type: "string",
        },
      });
    }
  }
}

function ensureDiscoveredRouteOperations(doc) {
  doc.paths ??= {};
  for (const route of discoverExpressRoutes()) {
    doc.paths[route.pathname] ??= {};
    if (!doc.paths[route.pathname][route.method]) {
      doc.paths[route.pathname][route.method] = {
        tags: route.pathname.startsWith("/api/control-plane/") ? ["control-plane"] : ["default"],
        summary: `${route.method.toUpperCase()} ${route.pathname}`,
        description: `Discovered from ${route.source_file}. Keep this operation documented or remove the route.`,
        responses: {
          200: {
            description: `${route.method.toUpperCase()} ${route.pathname}`,
          },
        },
      };
    }
    ensurePathParameters(route.pathname, doc.paths[route.pathname][route.method]);
  }
}

function ensureRequestExamples(pathname, method, operation, doc) {
  if (!operation.requestBody || typeof operation.requestBody !== "object") return;
  const content = operation.requestBody.content;
  if (!content || typeof content !== "object") return;

  const overrideKey = `${method.toUpperCase()} ${pathname}`;
  for (const mediaType of JSON_MEDIA_TYPES) {
    const media = content[mediaType];
    if (!media || typeof media !== "object") continue;
    if (media.example !== undefined || media.examples !== undefined) continue;
    if (REQUEST_EXAMPLE_OVERRIDES[overrideKey]) {
      media.example = REQUEST_EXAMPLE_OVERRIDES[overrideKey];
      continue;
    }
    const inferred = inferExampleFromSchema(media.schema, doc);
    if (inferred !== null) media.example = inferred;
  }
}

function ensureResponseExamples(pathname, method, operation, doc) {
  operation.responses ??= {};
  for (const [statusCode, response] of Object.entries(operation.responses)) {
    if (!response || typeof response !== "object") continue;
    if (response.$ref) continue;

    if (!response.content && /^2\d\d$/.test(statusCode)) {
      const overrideKey = `${method.toUpperCase()} ${pathname} ${statusCode}`;
      response.content = {
        "application/json": {
          schema: {
            type: "object",
            additionalProperties: true,
          },
          example: RESPONSE_EXAMPLE_OVERRIDES[overrideKey] ?? { ok: true },
        },
      };
    }

    const content = response.content;
    if (!content || typeof content !== "object") continue;

    for (const mediaType of JSON_MEDIA_TYPES) {
      const media = content[mediaType];
      if (!media || typeof media !== "object") continue;
      const overrideKey = `${method.toUpperCase()} ${pathname} ${statusCode}`;
      if (RESPONSE_EXAMPLE_OVERRIDES[overrideKey]) {
        media.example = RESPONSE_EXAMPLE_OVERRIDES[overrideKey];
        delete media.examples;
        continue;
      }

      if (media.example !== undefined || media.examples !== undefined) continue;

      const inferred = inferExampleFromSchema(media.schema, doc);
      if (inferred !== null) {
        media.example = inferred;
      } else if (/^2\d\d$/.test(statusCode)) {
        media.example = { ok: true };
      }
    }
  }
}

function normalizeOpenApiDoc(doc) {
  doc.info ??= {};
  doc.info.title = "DonggriCompany API";
  doc.info.version = readPackageVersion();
  doc.info.description = "Baseline OpenAPI contract for commonly used DonggriCompany endpoints.";
  normalizeNullableTypes(doc);
  ensureErrorResponseSchema(doc);
  ensureStandardErrorResponses(doc);
  ensureSecuritySchemes(doc);
  doc.paths ??= {};
  ensureDiscoveredRouteOperations(doc);

  for (const [pathname, pathItem] of Object.entries(doc.paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const method of METHODS) {
      const operation = pathItem[method];
      if (!operation || typeof operation !== "object") continue;
      if (isProtectedOperation(pathname, method, operation, doc)) {
        ensureOperationSecurity(pathname, method, operation);
      }
      ensureLocalMutationOriginContract(pathname, method, operation, doc);
      ensureOperationErrorResponses(pathname, method, operation, doc);
      ensureRequestExamples(pathname, method, operation, doc);
      ensureResponseExamples(pathname, method, operation, doc);
    }
  }
}

async function validateOpenApi(doc) {
  try {
    await SwaggerParser.validate(doc);
  } catch (error) {
    exitWithError(`OpenAPI validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function reportSummary(doc) {
  let operationCount = 0;
  for (const pathItem of Object.values(doc.paths ?? {})) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const method of METHODS) {
      if (pathItem[method]) operationCount += 1;
    }
  }
  console.log(`[openapi] validated ${operationCount} operations`);
}

async function main() {
  const { raw, doc } = loadOpenApiFile();
  normalizeOpenApiDoc(doc);
  await validateOpenApi(doc);

  const next = await serializeDoc(doc);
  if (MODE === "write") {
    fs.writeFileSync(OPENAPI_PATH, next, "utf8");
    reportSummary(doc);
    console.log(`[openapi] synced ${path.relative(process.cwd(), OPENAPI_PATH)}`);
    return;
  }

  const current = raw.endsWith("\n") ? raw : `${raw}\n`;
  if (current !== next) {
    exitWithError("OpenAPI contract is out of sync. Run `pnpm run openapi:sync` and commit the updated spec.");
  }
  reportSummary(doc);
  console.log("[openapi] check passed");
}

await main();

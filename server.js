const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const CONFIG_PATH = path.join(__dirname, "mocks.json");
const PUBLIC_DIR = path.join(__dirname, "public");

let config = { routes: [] };

function safeParseJson(content, fallbackValue) {
  try {
    return JSON.parse(content);
  } catch (err) {
    console.error("[mock-server] JSON parse failed:", err.message);
    return fallbackValue;
  }
}

function normalizeMethod(method) {
  return String(method || "GET").toUpperCase();
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ routes: [] }, null, 2), "utf-8");
  }

  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  const parsed = safeParseJson(raw, { routes: [] });

  if (!parsed || !Array.isArray(parsed.routes)) {
    console.warn("[mock-server] mocks.json 格式不正确，已回退为空路由配置。");
    config = { routes: [] };
    return;
  }

  config = {
    routes: parsed.routes.map((route) => ({
      method: normalizeMethod(route.method),
      path: String(route.path || "/"),
      status: Number(route.status || 200),
      headers: route.headers && typeof route.headers === "object" ? route.headers : {},
      body: route.body === undefined ? null : route.body,
      delayMs: Number(route.delayMs || 0)
    }))
  };
  console.log(`[mock-server] loaded ${config.routes.length} route(s).`);
}

function watchConfig() {
  let timer = null;
  fs.watch(CONFIG_PATH, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      loadConfig();
      console.log("[mock-server] reload mocks.json completed.");
    }, 100);
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders
  });
  res.end(body);
}

function sendFile(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    sendJson(res, 404, { error: "File not found" });
    return;
  }

  const content = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": content.length
  });
  res.end(content);
}

function findRoute(method, pathname) {
  const normalizedMethod = normalizeMethod(method);
  return config.routes.find((route) => route.method === normalizedMethod && route.path === pathname);
}

function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

async function handleAdminApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/__admin/routes") {
    sendJson(res, 200, config);
    return true;
  }

  if (req.method === "PUT" && pathname === "/__admin/route") {
    try {
      const data = await readRequestBody(req);
      if (!data || typeof data !== "object") {
        sendJson(res, 400, { error: "Body must be JSON object" });
        return true;
      }

      const method = normalizeMethod(data.method);
      const routePath = String(data.path || "");
      if (!routePath.startsWith("/")) {
        sendJson(res, 400, { error: "path must start with /" });
        return true;
      }

      const idx = config.routes.findIndex((r) => r.method === method && r.path === routePath);
      const nextRoute = {
        method,
        path: routePath,
        status: Number(data.status || 200),
        headers: data.headers && typeof data.headers === "object" ? data.headers : {},
        body: data.body === undefined ? null : data.body,
        delayMs: Number(data.delayMs || 0)
      };

      if (idx >= 0) {
        config.routes[idx] = nextRoute;
      } else {
        config.routes.push(nextRoute);
      }

      saveConfig();
      sendJson(res, 200, { ok: true, route: nextRoute });
      return true;
    } catch (err) {
      sendJson(res, 400, { error: err.message });
      return true;
    }
  }

  if (req.method === "DELETE" && pathname === "/__admin/route") {
    try {
      const data = await readRequestBody(req);
      const method = normalizeMethod(data && data.method);
      const routePath = String((data && data.path) || "");

      const prevLength = config.routes.length;
      config.routes = config.routes.filter((r) => !(r.method === method && r.path === routePath));
      const deleted = config.routes.length !== prevLength;

      if (deleted) {
        saveConfig();
      }

      sendJson(res, 200, { ok: true, deleted });
      return true;
    } catch (err) {
      sendJson(res, 400, { error: err.message });
      return true;
    }
  }

  return false;
}

function resolveBodyAndHeaders(route) {
  const headers = { ...route.headers };

  if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json; charset=utf-8";
  }

  const contentType = String(headers["Content-Type"] || headers["content-type"] || "").toLowerCase();

  if (contentType.includes("application/json")) {
    return {
      headers,
      body: JSON.stringify(route.body)
    };
  }

  if (typeof route.body === "string") {
    return {
      headers,
      body: route.body
    };
  }

  return {
    headers,
    body: JSON.stringify(route.body)
  };
}

async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/__admin") {
    sendFile(res, path.join(PUBLIC_DIR, "admin.html"), "text/html; charset=utf-8");
    return;
  }

  if (req.method === "GET" && pathname === "/__admin/app.js") {
    sendFile(res, path.join(PUBLIC_DIR, "app.js"), "application/javascript; charset=utf-8");
    return;
  }

  if (req.method === "GET" && pathname === "/__admin/styles.css") {
    sendFile(res, path.join(PUBLIC_DIR, "styles.css"), "text/css; charset=utf-8");
    return;
  }

  const adminHandled = await handleAdminApi(req, res, pathname);
  if (adminHandled) {
    return;
  }

  const route = findRoute(req.method, pathname);
  if (!route) {
    sendJson(res, 404, {
      error: "Mock route not found",
      method: normalizeMethod(req.method),
      path: pathname,
      suggestion: "Use PUT /__admin/route or edit mocks.json"
    });
    return;
  }

  const { headers, body } = resolveBodyAndHeaders(route);

  const send = () => {
    res.writeHead(route.status, {
      ...headers,
      "Content-Length": Buffer.byteLength(body)
    });
    res.end(body);
  };

  if (route.delayMs > 0) {
    setTimeout(send, route.delayMs);
    return;
  }

  send();
}

loadConfig();
watchConfig();

const server = http.createServer((req, res) => {
  requestHandler(req, res).catch((err) => {
    console.error("[mock-server] unexpected error:", err);
    sendJson(res, 500, { error: "Internal server error" });
  });
});

server.listen(PORT, () => {
  console.log(`[mock-server] listening on http://localhost:${PORT}`);
  console.log("[mock-server] admin endpoints:");
  console.log("  GET    /__admin/routes");
  console.log("  PUT    /__admin/route");
  console.log("  DELETE /__admin/route");
});

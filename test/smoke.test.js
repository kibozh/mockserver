const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        resolve({ status: res.statusCode, headers: res.headers, body: raw });
      });
    });
    req.on("error", reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function waitForServer(child, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server start timeout")), timeoutMs);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("listening on")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited unexpectedly: ${code}`));
    });
  });
}

test("mock server supports route response and admin update", async () => {
  const port = 3101;
  const configPath = path.join(__dirname, "..", "mocks.json");
  const originalConfig = fs.readFileSync(configPath, "utf-8");
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child);

    const setupPayload = JSON.stringify({
      method: "GET",
      path: "/api/test/dynamic",
      status: 200,
      body: { name: "Mock User", vip: true }
    });

    const setupRes = await request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/__admin/route",
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(setupPayload)
        }
      },
      setupPayload
    );
    assert.equal(setupRes.status, 200);

    const before = await request({
      hostname: "127.0.0.1",
      port,
      path: "/api/test/dynamic",
      method: "GET"
    });

    assert.equal(before.status, 200);
    const beforeJson = JSON.parse(before.body);
    assert.equal(beforeJson.name, "Mock User");

    const adminPage = await request({
      hostname: "127.0.0.1",
      port,
      path: "/__admin",
      method: "GET"
    });
    assert.equal(adminPage.status, 200);
    assert.match(adminPage.headers["content-type"], /text\/html/);
    assert.match(adminPage.body, /Mock 控制台/);

    const updatedPayload = JSON.stringify({
      method: "GET",
      path: "/api/test/dynamic",
      status: 200,
      body: { id: "u_1001", name: "Updated Name", vip: false }
    });

    const adminRes = await request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/__admin/route",
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(updatedPayload)
        }
      },
      updatedPayload
    );

    assert.equal(adminRes.status, 200);

    const after = await request({
      hostname: "127.0.0.1",
      port,
      path: "/api/test/dynamic",
      method: "GET"
    });

    assert.equal(after.status, 200);
    const afterJson = JSON.parse(after.body);
    assert.equal(afterJson.name, "Updated Name");
    assert.equal(afterJson.vip, false);

    const latestConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const targetRoute = latestConfig.routes.find((item) => item.method === "GET" && item.path === "/api/test/dynamic");
    assert.ok(targetRoute);
    targetRoute.body.name = "Reloaded From File";
    fs.writeFileSync(configPath, JSON.stringify(latestConfig, null, 2), "utf-8");

    await new Promise((resolve) => setTimeout(resolve, 250));

    const fileReloaded = await request({
      hostname: "127.0.0.1",
      port,
      path: "/api/test/dynamic",
      method: "GET"
    });

    assert.equal(fileReloaded.status, 200);
    const fileReloadedJson = JSON.parse(fileReloaded.body);
    assert.equal(fileReloadedJson.name, "Reloaded From File");
  } finally {
    child.kill();
    fs.writeFileSync(configPath, originalConfig, "utf-8");
  }
});

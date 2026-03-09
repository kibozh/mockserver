const routeListEl = document.getElementById("routeList");
const statusBar = document.getElementById("statusBar");
const routeForm = document.getElementById("routeForm");
const methodEl = document.getElementById("method");
const pathEl = document.getElementById("path");
const statusEl = document.getElementById("status");
const delayMsEl = document.getElementById("delayMs");
const headersEl = document.getElementById("headers");
const bodyEl = document.getElementById("body");
const refreshBtn = document.getElementById("refreshBtn");
const searchBtn = document.getElementById("searchBtn");
const searchKeywordEl = document.getElementById("searchKeyword");
const resetBtn = document.getElementById("resetBtn");
const formTitle = document.getElementById("formTitle");
const routeCardTpl = document.getElementById("routeCardTpl");

function setStatus(message, isError = false) {
  statusBar.textContent = message;
  statusBar.style.color = isError ? "#9a3412" : "#6b6256";
}

function pretty(value) {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function parseFlexibleInput(raw) {
  const text = raw.trim();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    if (/^-?\d+(\.\d+)?$/.test(text)) {
      return Number(text);
    }
    if (text === "true") {
      return true;
    }
    if (text === "false") {
      return false;
    }
    if (text === "null") {
      return null;
    }
    return text;
  }
}

async function fetchRoutes(keyword = "") {
  const query = keyword.trim();
  const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
  const res = await fetch(`/__admin/routes${suffix}`);
  if (!res.ok) {
    throw new Error(`加载路由失败: ${res.status}`);
  }
  return res.json();
}

function fillForm(route) {
  methodEl.value = route.method;
  pathEl.value = route.path;
  statusEl.value = route.status;
  delayMsEl.value = route.delayMs || 0;
  headersEl.value = pretty(route.headers || {});
  bodyEl.value = pretty(route.body);
  formTitle.textContent = `编辑路由 ${route.method} ${route.path}`;
}

function resetForm() {
  routeForm.reset();
  statusEl.value = "200";
  delayMsEl.value = "0";
  headersEl.value = '{\n  "Content-Type": "application/json; charset=utf-8"\n}';
  bodyEl.value = '{\n  "message": "hello mock"\n}';
  formTitle.textContent = "新增 / 覆盖路由";
}

function renderRoutes(routes) {
  routeListEl.innerHTML = "";

  if (!routes.length) {
    routeListEl.innerHTML = "<p>暂无路由，先创建一个吧。</p>";
    return;
  }

  routes
    .slice()
    .sort((a, b) => `${a.method}:${a.path}`.localeCompare(`${b.method}:${b.path}`))
    .forEach((route) => {
      const node = routeCardTpl.content.firstElementChild.cloneNode(true);
      node.querySelector(".method").textContent = route.method;
      node.querySelector(".route-path").textContent = route.path;
      node.querySelector(".status-code").textContent = `HTTP ${route.status}`;
      node.querySelector(".meta").textContent = `delay=${route.delayMs || 0}ms | headers=${Object.keys(route.headers || {}).length}`;
      node.querySelector(".preview").textContent = pretty(route.body);

      node.querySelector(".btn-edit").addEventListener("click", () => fillForm(route));
      node.querySelector(".btn-delete").addEventListener("click", async () => {
        try {
          const res = await fetch("/__admin/route", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ method: route.method, path: route.path })
          });
          if (!res.ok) {
            throw new Error(`删除失败: ${res.status}`);
          }
          setStatus(`已删除 ${route.method} ${route.path}`);
          await refreshRoutes();
        } catch (err) {
          setStatus(err.message, true);
        }
      });

      routeListEl.appendChild(node);
    });
}

async function refreshRoutes() {
  try {
    const keyword = searchKeywordEl.value || "";
    const data = await fetchRoutes(keyword);
    renderRoutes(data.routes || []);
    const loadedCount = data.routes ? data.routes.length : 0;
    if (keyword.trim()) {
      setStatus(`已加载 ${loadedCount} 条路由（当前会话 + 关键字匹配）`);
    } else {
      setStatus(`已加载 ${loadedCount} 条路由（当前会话）`);
    }
  } catch (err) {
    setStatus(err.message, true);
  }
}

routeForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const route = {
      method: methodEl.value,
      path: pathEl.value.trim(),
      status: Number(statusEl.value),
      delayMs: Number(delayMsEl.value || 0),
      headers: JSON.parse(headersEl.value || "{}"),
      body: parseFlexibleInput(bodyEl.value)
    };

    const res = await fetch("/__admin/route", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(route)
    });

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(`保存失败: ${res.status} ${msg}`);
    }

    setStatus(`已保存 ${route.method} ${route.path}`);
    await refreshRoutes();
  } catch (err) {
    setStatus(err.message, true);
  }
});

refreshBtn.addEventListener("click", refreshRoutes);
searchBtn.addEventListener("click", refreshRoutes);
searchKeywordEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    refreshRoutes();
  }
});
resetBtn.addEventListener("click", resetForm);

resetForm();
refreshRoutes();

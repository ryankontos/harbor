import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.js";

const sessionCookieName = "harbor_session";
const csrfHeaderName = "x-harbor-csrf";

interface SessionPayload {
  username: string;
  expiresAt: number;
  csrfToken: string;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(value: string): string {
  return createHmac("sha256", config.web.sessionSecret).update(value).digest("base64url");
}

function encodeSession(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function decodeSession(token: string | undefined): SessionPayload | null {
  if (!token) {
    return null;
  }

  const separator = token.lastIndexOf(".");
  if (separator <= 0) {
    return null;
  }

  const encoded = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  if (!safeEqual(signature, sign(encoded))) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (parsed.expiresAt <= Date.now() || parsed.username !== config.web.username || !parsed.csrfToken) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(request: FastifyRequest): Record<string, string> {
  const header = request.headers.cookie;
  if (!header) {
    return {};
  }

  return Object.fromEntries(
    header
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separator = item.indexOf("=");
        if (separator < 0) {
          return [item, ""];
        }
        return [item.slice(0, separator), decodeURIComponent(item.slice(separator + 1))];
      })
  );
}

function cookieBaseAttributes(): string[] {
  return [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    config.publicBaseURL.startsWith("https://") ? "Secure" : ""
  ].filter(Boolean);
}

export function createSessionCookie(): { cookie: string; csrfToken: string } {
  const payload: SessionPayload = {
    username: config.web.username,
    expiresAt: Date.now() + config.web.sessionTtlMs,
    csrfToken: randomUUID()
  };

  const token = encodeSession(payload);
  const cookie = [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    `Max-Age=${Math.floor(config.web.sessionTtlMs / 1000)}`,
    ...cookieBaseAttributes()
  ].join("; ");

  return { cookie, csrfToken: payload.csrfToken };
}

export function clearSessionCookie(): string {
  return [
    `${sessionCookieName}=`,
    "Max-Age=0",
    ...cookieBaseAttributes()
  ].join("; ");
}

export function getSession(request: FastifyRequest): SessionPayload | null {
  return decodeSession(parseCookies(request)[sessionCookieName]);
}

export function isWebAuthenticated(request: FastifyRequest): boolean {
  return Boolean(getSession(request));
}

export function validateWebCsrf(request: FastifyRequest): boolean {
  const session = getSession(request);
  if (!session) {
    return false;
  }

  const header = request.headers[csrfHeaderName];
  return typeof header === "string" && safeEqual(header, session.csrfToken);
}

export function sendLoginRedirect(reply: FastifyReply): FastifyReply {
  return reply.redirect("/login");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderLoginPage(serverName: string): string {
  const title = escapeHtml(serverName);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} Login</title>
    <style>
      :root {
        color-scheme: dark;
        --bg-a: #07131a;
        --bg-b: #112633;
        --panel: rgba(8, 19, 27, 0.84);
        --panel-strong: rgba(12, 28, 39, 0.94);
        --border: rgba(159, 225, 255, 0.18);
        --accent: #7df2dc;
        --accent-2: #98c9ff;
        --text: #eff7fb;
        --muted: #9eb4c4;
        --danger: #ff8b7a;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top left, rgba(125, 242, 220, 0.2), transparent 35%),
          radial-gradient(circle at bottom right, rgba(152, 201, 255, 0.16), transparent 30%),
          linear-gradient(160deg, var(--bg-a), var(--bg-b));
        color: var(--text);
        font: 16px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .shell {
        width: min(420px, calc(100vw - 32px));
        padding: 28px;
        border: 1px solid var(--border);
        border-radius: 28px;
        background: var(--panel);
        backdrop-filter: blur(20px);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
      }
      h1 {
        margin: 0 0 8px;
        font-size: 2rem;
      }
      p {
        margin: 0 0 20px;
        color: var(--muted);
      }
      label {
        display: block;
        margin: 16px 0 8px;
        color: var(--muted);
      }
      input {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 14px 16px;
        background: var(--panel-strong);
        color: var(--text);
        font: inherit;
      }
      button {
        width: 100%;
        margin-top: 18px;
        border: 0;
        border-radius: 999px;
        padding: 14px 18px;
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
        color: #062028;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .error {
        min-height: 24px;
        margin-top: 14px;
        color: var(--danger);
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <h1>${title}</h1>
      <p>Sign in to reach the private server dashboard.</p>
      <form id="login-form">
        <label for="username">Username</label>
        <input id="username" name="username" autocomplete="username" value="${escapeHtml(config.web.username)}" />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" />
        <button type="submit">Open Dashboard</button>
        <div class="error" id="error"></div>
      </form>
    </main>
    <script>
      const form = document.getElementById("login-form");
      const error = document.getElementById("error");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        error.textContent = "";
        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;
        const response = await fetch("/web/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });
        if (response.ok) {
          window.location.href = "/dashboard";
          return;
        }
        error.textContent = "Incorrect username or password.";
      });
    </script>
  </body>
</html>`;
}

export function renderDashboardPage(serverName: string, csrfToken: string): string {
  const title = escapeHtml(serverName);
  const csrf = escapeHtml(csrfToken);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} Dashboard</title>
    <style>
      :root {
        color-scheme: dark;
        --bg-a: #061117;
        --bg-b: #112734;
        --bg-c: #18374b;
        --panel: rgba(10, 24, 34, 0.78);
        --panel-strong: rgba(8, 20, 30, 0.94);
        --border: rgba(140, 215, 255, 0.16);
        --text: #f3fbff;
        --muted: #9fb9c6;
        --accent: #7df2dc;
        --accent-2: #9cc4ff;
        --warning: #ffcf7a;
        --danger: #ff8d7f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(125, 242, 220, 0.2), transparent 32%),
          radial-gradient(circle at top right, rgba(156, 196, 255, 0.18), transparent 28%),
          linear-gradient(160deg, var(--bg-a), var(--bg-b) 50%, var(--bg-c));
        color: var(--text);
        font: 15px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .page {
        width: min(1220px, calc(100vw - 28px));
        margin: 0 auto;
        padding: 24px 0 40px;
      }
      .hero, .card {
        border: 1px solid var(--border);
        background: var(--panel);
        backdrop-filter: blur(18px);
        box-shadow: 0 18px 56px rgba(0, 0, 0, 0.22);
      }
      .hero {
        border-radius: 30px;
        padding: 26px;
        display: grid;
        gap: 18px;
      }
      .hero-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
      }
      h1 { margin: 0; font-size: clamp(2rem, 4vw, 3.3rem); }
      .muted { color: var(--muted); }
      .hero-actions { display: flex; gap: 10px; flex-wrap: wrap; }
      button {
        border: 0;
        border-radius: 999px;
        padding: 11px 16px;
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
        color: #042027;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      button.secondary {
        color: var(--text);
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid var(--border);
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
      }
      .card {
        border-radius: 24px;
        padding: 18px;
      }
      .label {
        color: var(--muted);
        font-size: 0.88rem;
      }
      .value {
        font-size: 1.8rem;
        margin-top: 8px;
      }
      .grid {
        margin-top: 18px;
        display: grid;
        grid-template-columns: 1.4fr 0.9fr;
        gap: 18px;
      }
      .stack {
        display: grid;
        gap: 18px;
      }
      .section-title {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
        margin-bottom: 16px;
      }
      .section-title h2 {
        margin: 0;
        font-size: 1.15rem;
      }
      .chart-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }
      .chart {
        min-height: 124px;
      }
      .chart svg {
        width: 100%;
        height: 76px;
        overflow: visible;
      }
      .list {
        display: grid;
        gap: 10px;
      }
      .list-item {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 10px;
        align-items: center;
        padding: 12px 14px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.04);
      }
      .pill {
        padding: 5px 10px;
        border-radius: 999px;
        background: rgba(125, 242, 220, 0.14);
        color: var(--accent);
        font-size: 0.8rem;
      }
      .danger { color: var(--danger); }
      .warning { color: var(--warning); }
      .controls {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .storage-bar {
        margin-top: 8px;
        height: 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        overflow: hidden;
      }
      .storage-fill {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--accent), var(--accent-2));
      }
      @media (max-width: 980px) {
        .metrics, .chart-row, .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <section class="hero">
        <div class="hero-top">
          <div>
            <div class="muted">Private server dashboard</div>
            <h1>${title}</h1>
            <div class="muted" id="hero-status">Loading live status…</div>
          </div>
          <div class="hero-actions">
            <button class="secondary" id="refresh-button" type="button">Refresh</button>
            <button class="secondary" id="logout-button" type="button">Log Out</button>
          </div>
        </div>
        <div class="metrics" id="hero-metrics"></div>
      </section>

      <div class="grid">
        <div class="stack">
          <section class="card">
            <div class="section-title">
              <h2>Trends</h2>
              <span class="muted">Recent history without the clutter</span>
            </div>
            <div class="chart-row" id="charts"></div>
          </section>

          <section class="card">
            <div class="section-title">
              <h2>Running Processes</h2>
              <span class="muted">Highest CPU first</span>
            </div>
            <div class="list" id="processes"></div>
          </section>

          <section class="card">
            <div class="section-title">
              <h2>Network Interruptions</h2>
              <span class="muted">Recent outage history</span>
            </div>
            <div class="list" id="interruptions"></div>
          </section>
        </div>

        <div class="stack">
          <section class="card">
            <div class="section-title">
              <h2>Storage</h2>
              <span class="muted" id="storage-summary"></span>
            </div>
            <div class="list" id="storage"></div>
          </section>

          <section class="card">
            <div class="section-title">
              <h2>Speed Tests</h2>
              <span class="muted">Automated checks</span>
            </div>
            <div class="list" id="speed-tests"></div>
          </section>

          <section class="card">
            <div class="section-title">
              <h2>Controls</h2>
              <span class="muted">Origin-side actions</span>
            </div>
            <div class="controls" id="controls"></div>
          </section>
        </div>
      </div>
    </div>
    <script>
      const csrfToken = ${JSON.stringify(csrf)};
      const heroMetrics = document.getElementById("hero-metrics");
      const heroStatus = document.getElementById("hero-status");
      const charts = document.getElementById("charts");
      const processes = document.getElementById("processes");
      const interruptions = document.getElementById("interruptions");
      const storage = document.getElementById("storage");
      const storageSummary = document.getElementById("storage-summary");
      const speedTests = document.getElementById("speed-tests");
      const controls = document.getElementById("controls");

      function formatPercent(value) {
        return value == null ? "—" : value.toFixed(1) + "%";
      }

      function formatBytes(bytes) {
        if (!bytes) return "0 B";
        const units = ["B", "KB", "MB", "GB", "TB"];
        let index = 0;
        let value = bytes;
        while (value >= 1024 && index < units.length - 1) {
          value /= 1024;
          index += 1;
        }
        return value.toFixed(value >= 10 || index === 0 ? 0 : 1) + " " + units[index];
      }

      function relativeTime(iso) {
        if (!iso) return "—";
        const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
        if (diff < 60) return diff + "s ago";
        if (diff < 3600) return Math.floor(diff / 60) + "m ago";
        if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
        return Math.floor(diff / 86400) + "d ago";
      }

      function sparkline(samples, stroke) {
        if (!samples?.length) {
          return "<div class='muted'>No data yet</div>";
        }
        const ordered = [...samples].reverse();
        const width = 260;
        const height = 76;
        const values = ordered.map((item) => item.value);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const spread = Math.max(max - min, 1);
        const points = ordered.map((item, index) => {
          const x = (index / Math.max(ordered.length - 1, 1)) * width;
          const y = height - ((item.value - min) / spread) * (height - 8) - 4;
          return [x.toFixed(2), y.toFixed(2)].join(",");
        }).join(" ");
        return \`<svg viewBox="0 0 \${width} \${height}" preserveAspectRatio="none">
          <polyline fill="none" stroke="\${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="\${points}" />
        </svg>\`;
      }

      function setList(el, rows, emptyText) {
        if (!rows.length) {
          el.innerHTML = \`<div class="muted">\${emptyText}</div>\`;
          return;
        }
        el.innerHTML = rows.join("");
      }

      async function runAction(path) {
        const response = await fetch(path, {
          method: "POST",
          headers: { "X-Harbor-CSRF": csrfToken }
        });
        if (!response.ok) {
          alert("That action failed.");
          return;
        }
        await loadDashboard();
      }

      async function loadDashboard() {
        const response = await fetch("/web/api/dashboard", { credentials: "same-origin" });
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        const data = await response.json();
        const outage = data.connectivity.outageActiveSince ? "Outage in progress" : data.connectivity.isOnline ? "Online" : "Offline";
        heroStatus.textContent = \`\${outage} • Updated \${relativeTime(data.generatedAt)} • Next heartbeat \${data.heartbeat.nextExpectedAt ? relativeTime(data.heartbeat.nextExpectedAt) : "unknown"}\`;

        heroMetrics.innerHTML = [
          ["Battery", data.battery.levelPercent == null ? "—" : Math.round(data.battery.levelPercent) + "%", data.battery.chargeStatus],
          ["CPU", formatPercent(data.cpu.loadPercent), data.cpu.temperatureCelsius == null ? "No temp sensor" : data.cpu.temperatureCelsius.toFixed(1) + "°C"],
          ["Memory", formatPercent(data.memory.usedPercent), \`\${formatBytes(data.memory.usedBytes)} of \${formatBytes(data.memory.totalBytes)}\`],
          ["Network", data.connectivity.isOnline ? "Healthy" : "Offline", data.connectivity.outageActiveSince ? "Since " + relativeTime(data.connectivity.outageActiveSince) : "Checked " + relativeTime(data.connectivity.lastCheckedAt)]
        ].map(([label, value, detail]) => \`<div class="card"><div class="label">\${label}</div><div class="value">\${value}</div><div class="muted">\${detail}</div></div>\`).join("");

        charts.innerHTML = [
          ["CPU Load", formatPercent(data.cpu.loadPercent), sparkline(data.trends.cpuLoad, "#7df2dc")],
          ["Memory Used", formatPercent(data.memory.usedPercent), sparkline(data.trends.memoryUsed, "#9cc4ff")],
          ["Battery", data.battery.levelPercent == null ? "—" : Math.round(data.battery.levelPercent) + "%", sparkline(data.trends.batteryLevel, "#ffcf7a")],
          ["Connectivity", data.connectivity.isOnline ? "Online" : "Offline", sparkline(data.trends.connectivity, "#ff8d7f")]
        ].map(([label, value, chart]) => \`<div class="card chart"><div class="label">\${label}</div><div class="value">\${value}</div>\${chart}</div>\`).join("");

        setList(processes, data.runningProcesses.map((process) => \`<div class="list-item"><div><strong>\${process.name}</strong><div class="muted">PID \${process.pid}</div></div><div>\${formatPercent(process.cpuPercent)}</div><div class="muted">\${formatPercent(process.memoryPercent)} mem</div></div>\`), "No process samples yet.");

        setList(interruptions, data.interruptions.slice(0, 8).map((item) => \`<div class="list-item"><div><strong>\${item.endedAt ? "Recovered" : "Active outage"}</strong><div class="muted">\${item.reason}</div></div><div>\${relativeTime(item.startedAt)}</div><div class="\${item.endedAt ? "" : "danger"}">\${item.durationSeconds == null ? "ongoing" : item.durationSeconds + "s"}</div></div>\`), "No interruptions recorded.");

        const totalUsed = data.storage.reduce((sum, volume) => sum + volume.usedBytes, 0);
        const totalCapacity = data.storage.reduce((sum, volume) => sum + volume.totalBytes, 0);
        storageSummary.textContent = totalCapacity ? \`\${formatBytes(totalUsed)} / \${formatBytes(totalCapacity)}\` : "No volumes";
        setList(storage, data.storage.map((volume) => \`<div class="list-item" style="grid-template-columns:minmax(0,1fr);"><div><strong>\${volume.mount}</strong><div class="muted">\${formatBytes(volume.usedBytes)} of \${formatBytes(volume.totalBytes)}</div><div class="storage-bar"><div class="storage-fill" style="width:\${Math.min(volume.usedPercent, 100)}%"></div></div></div></div>\`), "No mounted volumes found.");

        setList(speedTests, data.speedTests.slice(0, 6).map((result) => \`<div class="list-item"><div><strong>\${result.downloadMbps.toFixed(0)} ↓ / \${result.uploadMbps.toFixed(0)} ↑</strong><div class="muted">\${result.isp || "Unknown ISP"}</div></div><div>\${result.latencyMs.toFixed(1)} ms</div><div class="muted">\${relativeTime(result.ranAt)}</div></div>\`), "No speed test results yet.");

        controls.innerHTML = data.controls.map((control) => \`<button type="button" data-control-id="\${control.id}">\${control.title}</button>\`).join("") || '<div class="muted">No controls configured.</div>';
        controls.querySelectorAll("button[data-control-id]").forEach((button) => {
          button.addEventListener("click", () => runAction("/web/api/actions/control/" + button.dataset.controlId));
        });
      }

      document.getElementById("refresh-button").addEventListener("click", loadDashboard);
      document.getElementById("logout-button").addEventListener("click", async () => {
        await fetch("/web/logout", {
          method: "POST",
          headers: { "X-Harbor-CSRF": csrfToken }
        });
        window.location.href = "/login";
      });

      loadDashboard();
      setInterval(loadDashboard, 15000);
    </script>
  </body>
</html>`;
}

import { PLAY_LOG } from "./playLogConfig.js";

const $ = (sel) => document.querySelector(sel);

function headers() {
  return {
    apikey: PLAY_LOG.supabaseAnonKey,
    Authorization: `Bearer ${PLAY_LOG.supabaseAnonKey}`,
    "Content-Type": "application/json",
  };
}

async function rpc(name, body = {}) {
  const base = PLAY_LOG.supabaseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${text}`.trim());
  }
  return res.json();
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pct(wins, total) {
  if (!total) return "—";
  return `${Math.round((100 * wins) / total)}%`;
}

function renderSummary(s) {
  const total = s.total || 0;
  $("#stat-total").textContent = String(total);
  $("#stat-winrate").textContent = pct(s.human_wins, total);
  $("#stat-wins").textContent = `${s.human_wins ?? 0} / ${total}`;
  $("#stat-rounds").textContent =
    s.mean_rounds != null ? String(s.mean_rounds) : "—";
  $("#stat-tricks").textContent =
    s.mean_tricks != null ? String(s.mean_tricks) : "—";
  $("#stat-hp").textContent =
    s.mean_human_hp != null && s.mean_enemy_hp != null
      ? `${s.mean_human_hp} / ${s.mean_enemy_hp}`
      : "—";
  $("#stat-range").textContent =
    s.first_game && s.last_game
      ? `${fmtDate(s.first_game)} → ${fmtDate(s.last_game)}`
      : "—";

  const hist = s.rounds_histogram || {};
  const wrap = $("#histogram");
  wrap.innerHTML = "";
  const keys = Object.keys(hist)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  const maxCount = Math.max(1, ...keys.map((k) => hist[String(k)] || 0));

  if (!keys.length) {
    wrap.innerHTML = '<p class="status">No round data yet.</p>';
    return;
  }

  for (const r of keys) {
    const c = hist[String(r)] || 0;
    const row = document.createElement("div");
    row.className = "hist-row";
    row.innerHTML = `
      <span>Round ${r}</span>
      <div class="hist-bar-wrap"><div class="hist-bar" style="width:${(100 * c) / maxCount}%"></div></div>
      <span>${c} (${total ? Math.round((100 * c) / total) : 0}%)</span>
    `;
    wrap.appendChild(row);
  }
}

function renderRecent(rows) {
  const tbody = $("#games-body");
  tbody.innerHTML = "";
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="5">No finished games logged yet.</td></tr>';
    return;
  }
  for (const g of rows) {
    const hp = g.final_hp || [0, 0];
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtDate(g.created_at)}</td>
      <td>${g.rounds_reached ?? "—"}</td>
      <td><span class="badge ${g.human_won ? "badge-win" : "badge-loss"}">${g.human_won ? "Win" : "Loss"}</span></td>
      <td>${hp[0]} / ${hp[1]}</td>
      <td>${g.tricks_completed ?? "—"}</td>
    `;
    tbody.appendChild(tr);
  }
}

function showError(msg) {
  $("#load-status").classList.remove("hidden");
  $("#load-status").classList.add("error");
  $("#load-status").textContent = msg;
  $("#dashboard-content").classList.add("hidden");
}

function showContent() {
  $("#load-status").classList.add("hidden");
  $("#dashboard-content").classList.remove("hidden");
}

async function load() {
  if (!PLAY_LOG.supabaseUrl || !PLAY_LOG.supabaseAnonKey) {
    showError(
      "Supabase is not configured. Set URL and anon key in playLogConfig.js.",
    );
    return;
  }

  $("#load-status").classList.remove("hidden", "error");
  $("#load-status").textContent = "Loading stats…";
  $("#dashboard-content").classList.add("hidden");

  try {
    const [summary, recent] = await Promise.all([
      rpc("play_stats_summary"),
      rpc("play_stats_recent", { p_limit: 30 }),
    ]);
    renderSummary(summary);
    renderRecent(Array.isArray(recent) ? recent : []);
    showContent();
    $("#updated-at").textContent = `Updated ${fmtDate(new Date().toISOString())}`;
  } catch (err) {
    const hint =
      err.message?.includes("404") || err.message?.includes("42883")
        ? " Run supabase/migrations/20260525120000_play_stats_dashboard.sql in the SQL Editor."
        : "";
    showError(`Could not load stats: ${err.message}${hint}`);
  }
}

$("#btn-refresh")?.addEventListener("click", () => load());
load();

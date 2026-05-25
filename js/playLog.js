/** Record finished online games (human decisions only). Incomplete games are never sent. */
import { PLAY_LOG } from "./playLogConfig.js";

const STORAGE_OPT_IN = "flip_siege_play_log_opt_in";
const CLIENT_VERSION = "play-0.5";

function canUseOnlineLog() {
  if (!PLAY_LOG.enabled) return false;
  const host = location.hostname;
  if (!PLAY_LOG.logLocalhost && (host === "localhost" || host === "127.0.0.1")) {
    return false;
  }
  if (location.protocol !== "https:" && !PLAY_LOG.logLocalhost) return false;
  return !!(endpointConfigured());
}

function endpointConfigured() {
  return (
    (PLAY_LOG.supabaseUrl && PLAY_LOG.supabaseAnonKey) || PLAY_LOG.webhookUrl
  );
}

export function playLogOptInDefault() {
  const stored = localStorage.getItem(STORAGE_OPT_IN);
  if (stored === null) return true;
  return stored === "1";
}

export function savePlayLogOptIn(on) {
  localStorage.setItem(STORAGE_OPT_IN, on ? "1" : "0");
}

export function isPlayLogAvailable() {
  return canUseOnlineLog() && endpointConfigured();
}

function sessionId() {
  let id = localStorage.getItem("flip_siege_session");
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `s-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem("flip_siege_session", id);
  }
  return id;
}

function snapCard(card) {
  if (!card) return null;
  return { id: card.id, color: card.color, mr: card.mr, tr: card.tr };
}

/** @param {boolean} userOptIn */
export function initPlayLog(game, userOptIn) {
  game.playLog = {
    sessionId: sessionId(),
    startedAt: new Date().toISOString(),
    userOptIn: !!userOptIn,
    humanPlays: [],
    armoryBuys: [],
    trophies: [],
    calamityPlays: [],
    tricksCompleted: 0,
    submitted: false,
  };
}

export function recordHumanCardPlay(game, card, ctx = {}) {
  const pl = game.playLog;
  if (!pl) return;
  pl.humanPlays.push({
    at: new Date().toISOString(),
    round: game.round,
    trickIndex: game.tricksPlayed,
    siegerTeam: game.siegerTeam,
    led: game.ledColor,
    card: snapCard(card),
    ...ctx,
  });
}

export function recordHumanArmoryBuy(game, key, extra = {}) {
  const pl = game.playLog;
  if (!pl) return;
  pl.armoryBuys.push({
    at: new Date().toISOString(),
    round: game.round,
    key,
    ...extra,
  });
}

export function recordHumanTrophy(game, card) {
  const pl = game.playLog;
  if (!pl) return;
  pl.trophies.push({
    at: new Date().toISOString(),
    round: game.round,
    card: snapCard(card),
  });
}

export function recordTrickCompleted(game) {
  if (game.playLog) game.playLog.tricksCompleted += 1;
}

function stashSnapshot(team) {
  const t = { green: 0, blue: 0, red: 0, yellow: 0 };
  for (const p of team.stash) t[p.card.color] = (t[p.card.color] || 0) + p.value;
  return t;
}

function qualifiesAsFinished(game) {
  const pl = game.playLog;
  if (!pl || pl.submitted) return false;
  if (!pl.userOptIn || !canUseOnlineLog()) return false;
  if (game.phase !== "gameover") return false;
  if (pl.tricksCompleted < 1) return false;
  if (pl.humanPlays.length < 1) return false;
  return true;
}

function buildPayload(game, endReason) {
  const pl = game.playLog;
  const t0 = game.teams[0];
  const t1 = game.teams[1];
  return {
    v: CLIENT_VERSION,
    session_id: pl.sessionId,
    finished_at: new Date().toISOString(),
    started_at: pl.startedAt,
    host: location.hostname,
    path: location.pathname,
    follow_mode: game.followMode,
    cooldown: !!game.cooldownMechanic,
    end_reason: endReason,
    winner_team: game.winner,
    human_won: game.winner === 0,
    rounds_reached: game.round,
    tricks_completed: pl.tricksCompleted,
    final_hp: [t0.castleHp, t1.castleHp],
    castle_max: t0.castleMax,
    human_plays: pl.humanPlays,
    armory_buys: pl.armoryBuys,
    trophies: pl.trophies,
    calamity_plays: pl.calamityPlays,
    final_stash: [stashSnapshot(t0), stashSnapshot(t1)],
    human_permanent: t0.permanent
      ? { type: t0.permanent, color: t0.permanentColor }
      : null,
    human_buffs: [...t0.activeBuffs],
    log_tail: game.log.slice(-24),
  };
}

async function postJson(url, headers, body) {
  const res = await fetch(url, {
    method: "POST",
    headers,
    body,
    keepalive: true,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${text}`.trim());
  }
}

/**
 * Call once when a match reaches game over. Fire-and-forget; never blocks UI.
 */
export function submitFinishedGameIfEligible(game, endReason = "castle") {
  if (!qualifiesAsFinished(game)) return;
  const pl = game.playLog;
  pl.submitted = true;

  const payload = buildPayload(game, endReason);
  const tasks = [];

  if (PLAY_LOG.supabaseUrl && PLAY_LOG.supabaseAnonKey) {
    const base = PLAY_LOG.supabaseUrl.replace(/\/$/, "");
    const url = `${base}/rest/v1/${PLAY_LOG.table}`;
    const headers = {
      "Content-Type": "application/json",
      apikey: PLAY_LOG.supabaseAnonKey,
      Authorization: `Bearer ${PLAY_LOG.supabaseAnonKey}`,
      Prefer: "return=minimal",
    };
    const body = JSON.stringify({
      session_id: payload.session_id,
      payload,
    });
    tasks.push(postJson(url, headers, body));
  }

  if (PLAY_LOG.webhookUrl) {
    const headers = { "Content-Type": "application/json" };
    const body = JSON.stringify(payload);
    tasks.push(postJson(PLAY_LOG.webhookUrl, headers, body));
  }

  Promise.all(tasks).catch((err) => {
    console.warn("[Flip-Siege play log]", err);
    pl.submitted = false;
  });
}

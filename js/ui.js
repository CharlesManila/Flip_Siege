/** DOM rendering. */
import { COLOR_META, cardLabel } from "./data/cards.js";
import {
  PERMANENT_COSTS,
  PERMANENT_DESCRIPTIONS,
  PERMANENT_NAMES,
  PERMANENT_UNLOCK_ROUND,
  ROUND_COSTS,
  ROUND_DESCRIPTIONS,
  ROUND_LABELS,
  ROUND_MIN,
  SHOP_DURATION,
  SHOP_DURATION_LABEL,
  VISIT_COSTS,
  VISIT_DESCRIPTIONS,
  VISIT_LABELS,
  canAfford,
  stashTotals,
} from "./rules.js";
import { humanMustPlay, isCalamityLead } from "./game.js";
import { canFollow } from "./rules.js";

const $ = (sel, root = document) => root.querySelector(sel);

export function renderCard(
  card,
  { siege = true, small = false, selected = false, playable = false, asButton = true } = {},
) {
  const m = COLOR_META[card.color];
  const el = document.createElement(asButton ? "button" : "div");
  if (asButton) el.type = "button";
  el.className = `card color-${card.color} ${siege ? "siege" : "defense"} ${small ? "small" : ""} ${selected ? "selected" : ""} ${playable ? "playable" : ""} ${asButton ? "" : "trick-card"}`.trim();
  if (asButton) el.dataset.cardId = card.id;
  if (siege) {
    el.innerHTML = `
      <span class="card-emoji">${m.emoji}</span>
      <span class="card-rank">${card.mr}</span>
      <span class="card-name">${m.monster}</span>
      <span class="card-sub">${m.tower} ${card.tr}</span>`;
  } else {
    el.innerHTML = `
      <span class="card-emoji">${m.towerEmoji}</span>
      <span class="card-rank">${card.tr}</span>
      <span class="card-name">${m.tower}</span>
      <span class="card-sub">${m.monster} ${card.mr}</span>`;
  }
  return el;
}

function stashBar(team) {
  const t = stashTotals(team);
  return ["green", "blue", "red", "yellow"]
    .map((c) => `<span class="stash-pip color-${c}" title="${c}">${c[0].toUpperCase()}:${t[c]}</span>`)
    .join("");
}

function renderPlayerSlot(p, game) {
  const siege = p.teamId === game.siegerTeam;
  const calamityDefend =
    game.phase === "calamity_reveal" && game.calamityReveal?.step === "defend";
  const isTurn =
    (game.phase === "playing" || calamityDefend) && humanMustPlay(game) && p.human;
  const div = document.createElement("div");
  div.className = `player-slot team-${p.teamId} ${p.human ? "human player-you" : "ai"} ${isTurn ? "active" : ""}`;
  if (p.human && isTurn) div.setAttribute("aria-label", "Your hand — tap a highlighted card to play");
  div.innerHTML = `
    <div class="player-name">${p.name}${p.human ? " ★" : ""}</div>
    <div class="hand-count">${p.hand.length} card${p.hand.length === 1 ? "" : "s"}</div>`;
  const handEl = document.createElement("div");
  handEl.className = "hand";
  if (p.human) {
    const turn = humanMustPlay(game) && p.human;
    const led = game.ledColor;
    const must = game.followMode === "must" && led;
    const followOpts = must ? canFollow(p.hand, led) : [];
    for (const c of p.hand) {
      let playable = turn;
      if (turn && must && followOpts.length) {
        playable = followOpts.some((x) => x.id === c.id);
      }
      const faceSiege = calamityDefend
        ? false
        : turn
          ? p.teamId === game.siegerTeam
          : siege;
      handEl.appendChild(renderCard(c, { siege: faceSiege, small: true, playable }));
    }
  } else {
    for (let i = 0; i < Math.min(p.hand.length, 6); i++) {
      const back = document.createElement("div");
      back.className = "card-back small";
      handEl.appendChild(back);
    }
    if (p.hand.length > 6) {
      handEl.appendChild(document.createTextNode(`+${p.hand.length - 6}`));
    }
  }
  div.appendChild(handEl);
  return div;
}

const COLOR_LABELS = { green: "Green", blue: "Blue", red: "Red", yellow: "Yellow" };

function teamLabel(teamId) {
  return teamId === 0 ? "Your reserve" : "Enemy reserve";
}

function appendCalamityDeckSection(el, r) {
  const deckSec = document.createElement("section");
  deckSec.className = "calamity-deck";
  deckSec.innerHTML = `<h4 class="calamity-section-title">Deck assault (from reserves)</h4>`;
  const deckRow = document.createElement("div");
  deckRow.className = "calamity-deck-row";

  const addDeckCard = (card, teamId, role) => {
    const wrap = document.createElement("div");
    wrap.className = "calamity-deck-card";
    wrap.innerHTML = `<div class="calamity-deck-label">${escapeHtml(teamLabel(teamId))} · ${escapeHtml(role)}</div>`;
    wrap.appendChild(renderCard(card, { siege: true, small: true, asButton: false }));
    deckRow.appendChild(wrap);
  };

  addDeckCard(r.c1, r.deck1Team, "Sets color + rank");
  const plus = document.createElement("div");
  plus.className = "calamity-plus";
  plus.textContent = "+";
  deckRow.appendChild(plus);
  addDeckCard(r.c2, r.deck2Team, "Adds monster rank");
  deckSec.appendChild(deckRow);

  const sum = r.rankSum ?? r.c1.mr + r.c2.mr;
  const assaultLine = document.createElement("p");
  assaultLine.className = "calamity-assault";
  assaultLine.innerHTML =
    r.assault === sum
      ? `Assault = <strong>${r.c1.mr}</strong> + <strong>${r.c2.mr}</strong> = <strong>${r.assault}</strong> (both teams must block this)`
      : `Assault = <strong>${r.c1.mr}</strong> + <strong>${r.c2.mr}</strong> = <strong>${sum}</strong> → <strong>${r.assault}</strong> (both teams must block this)`;
  deckSec.appendChild(assaultLine);
  el.appendChild(deckSec);
}

function renderCalamityCenter(game, hooks) {
  const el = $("#trick-center");
  if (!el || !game.calamityReveal) return;
  const r = game.calamityReveal;
  el.innerHTML = "";
  el.classList.remove("trick-empty");

  const header = document.createElement("div");
  header.className = "trick-header calamity-header";
  header.innerHTML = `
    <span class="trick-title">Calamity — deck siege</span>
    <span class="trick-tag">Round ${game.round} · last trick</span>
    <span class="trick-led color-${r.led}">Led color: <strong>${COLOR_LABELS[r.led] || r.led}</strong></span>`;
  el.appendChild(header);

  appendCalamityDeckSection(el, r);

  if (r.step === "deck") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "btn-calamity-continue";
    btn.className = "calamity-continue";
    btn.textContent = "Choose your defense";
    btn.onclick = () => hooks.onCalamityContinue?.();
    el.appendChild(btn);
    return;
  }

  if (r.step === "defend") {
    const defHint = document.createElement("p");
    defHint.className = "calamity-defend-hint";
    defHint.textContent =
      "Tower-up: each player plays one card. Follow the led color if you can.";
    el.appendChild(defHint);

    const row = document.createElement("div");
    row.className = "trick-plays";
    const plays = game.trickPlays || [];
    for (let i = 0; i < 4; i++) {
      const slot = document.createElement("div");
      slot.className = "trick-slot";
      if (plays[i]) {
        const { player, card } = plays[i];
        slot.innerHTML = `<div class="slot-label">${escapeHtml(player.name)}</div>`;
        slot.appendChild(renderCard(card, { siege: false, small: true, asButton: false }));
      } else if (i === plays.length && humanMustPlay(game)) {
        slot.classList.add("slot-active");
        slot.innerHTML = `<div class="slot-label">Your play</div><div class="slot-wait">Pick a card below</div>`;
      }
      row.appendChild(slot);
    }
    el.appendChild(row);
    return;
  }

  if (r.step === "results" && r.teamResults) {
    const defSec = document.createElement("section");
    defSec.className = "calamity-defenses";
    defSec.innerHTML = `<h4 class="calamity-section-title">Both teams defend (tower-up)</h4>`;
    const defGrid = document.createElement("div");
    defGrid.className = "calamity-def-grid";

    for (const tr of r.teamResults) {
      const col = document.createElement("div");
      col.className = `calamity-team-col team-${tr.teamId}`;
      const prepNote =
        tr.prepExtra > 0
          ? `<span class="calamity-penalty">Underprepared: +${tr.prepExtra} damage</span>`
          : `<span class="calamity-prep-ok">Reserve prep: +${tr.reservePrep} block</span>`;
      col.innerHTML = `
        <div class="calamity-team-head">${escapeHtml(tr.label)}</div>
        ${prepNote}
        <div class="calamity-result">Block <strong>${tr.block}</strong> → <strong>${tr.damage}</strong> damage</div>`;
      const cards = document.createElement("div");
      cards.className = "calamity-defense-cards";
      for (const d of tr.defenses) {
        const slot = document.createElement("div");
        slot.className = `calamity-defense-slot ${d.human ? "you" : ""}`;
        slot.innerHTML = `<div class="slot-name">${escapeHtml(d.playerName)}</div>`;
        const off = d.card.color !== r.led;
        const cardWrap = document.createElement("div");
        cardWrap.className = "slot-card-wrap";
        cardWrap.appendChild(
          renderCard(d.card, { siege: false, small: true, asButton: false }),
        );
        const tag = document.createElement("span");
        tag.className = off ? "off-color-tag" : "block-contrib-tag";
        tag.textContent = off ? "→ Stash" : `+${d.contrib} block`;
        cardWrap.appendChild(tag);
        slot.appendChild(cardWrap);
        cards.appendChild(slot);
      }
      col.appendChild(cards);
      defGrid.appendChild(col);
    }
    defSec.appendChild(defGrid);
    el.appendChild(defSec);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "btn-calamity-continue";
    btn.className = "calamity-continue";
    btn.textContent = "Continue";
    btn.onclick = () => hooks.onCalamityContinue?.();
    el.appendChild(btn);
  }
}

function renderTrickCenter(game, hooks = {}) {
  const el = $("#trick-center");
  if (!el) return;
  el.innerHTML = "";

  if (game.phase === "calamity_reveal") {
    renderCalamityCenter(game, hooks);
    return;
  }

  if (game.phase !== "playing") {
    el.classList.add("trick-empty");
    return;
  }

  const plays = game.trickPlays || [];
  const led = game.ledColor;
  const calamity = game.trickPlays.length === 0 && isCalamityLead(game);

  const header = document.createElement("div");
  header.className = "trick-header";
  if (led) {
    header.innerHTML = `
      <span class="trick-title">Current trick</span>
      <span class="trick-led color-${led}">Led color: <strong>${COLOR_LABELS[led] || led}</strong></span>
      ${calamity ? '<span class="trick-tag">Calamity</span>' : ""}`;
  } else if (humanMustPlay(game) && plays.length === 0) {
    header.innerHTML = `<span class="trick-title">You lead — pick a card to set color</span>`;
  } else {
    header.innerHTML = `<span class="trick-title">Current trick</span>`;
  }
  el.appendChild(header);

  const row = document.createElement("div");
  row.className = "trick-slots";

  const slotCount = 4;
  for (let i = 0; i < slotCount; i++) {
    const slot = document.createElement("div");
    slot.className = "trick-slot";
    const play = plays[i];
    if (play) {
      const { player, card, siege } = play;
      const role = siege ? "Siege" : "Defense";
      const off = led && card.color !== led;
      slot.classList.add("filled", `team-${player.teamId}`);
      if (player.human) slot.classList.add("you");
      slot.innerHTML = `
        <div class="slot-name">${escapeHtml(player.name)} <span class="slot-role">${role}</span></div>`;
      const cardWrap = document.createElement("div");
      cardWrap.className = "slot-card-wrap";
      cardWrap.appendChild(renderCard(card, { siege, small: true, asButton: false }));
      if (off) {
        const tag = document.createElement("span");
        tag.className = "off-color-tag";
        tag.textContent = "→ Stash";
        cardWrap.appendChild(tag);
      }
      slot.appendChild(cardWrap);
    } else {
      slot.classList.add("empty");
      const waiting =
        i === plays.length && humanMustPlay(game)
          ? "Your play"
          : i === plays.length
            ? "Next…"
            : "—";
      slot.innerHTML = `<div class="slot-placeholder">${waiting}</div>`;
    }
    row.appendChild(slot);
  }
  el.appendChild(row);

  if (plays.length > 0 && led) {
    const hint = document.createElement("p");
    hint.className = "trick-hint";
    hint.textContent =
      game.followMode === "must"
        ? `Matching ${COLOR_LABELS[led]} cards count for Assault / Block. Other colors go to Stash.`
        : `Must follow ${COLOR_LABELS[led]} if you can — or play off-color for Stash (may-follow).`;
    el.appendChild(hint);
  }

  el.classList.toggle("trick-empty", plays.length === 0 && !humanMustPlay(game));
}

function renderTrophyPicker(game, hooks) {
  const dlg = document.getElementById("trophy-dialog");
  const choices = document.getElementById("trophy-choices");
  if (!dlg || !choices || !game.pendingTrophy) return;

  const { defender, eligible, block } = game.pendingTrophy;
  const humanDef = game.players.some((p) => p.human && p.teamId === defender);
  if (!humanDef) {
    dlg.close();
    return;
  }

  const prompt = document.getElementById("trophy-prompt");
  if (prompt) {
    prompt.innerHTML = `Your team blocked with <strong>${block}</strong>. Each monster below contributed led-color Assault and has <strong>monster rank ≤ ${block}</strong>. 
      Pick <strong>one</strong> trophy (Stash value = <strong>monster rank</strong>; tower rank matters when you defend with that color later).`;
  }

  choices.innerHTML = "";
  for (const { card, assaultContrib } of eligible) {
    const m = COLOR_META[card.color];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `trophy-choice color-${card.color}`;
    btn.appendChild(renderCard(card, { siege: true, small: true, asButton: false }));
    const stats = document.createElement("div");
    stats.className = "trophy-stats";
    stats.innerHTML = `
        <div>Siege: ${m.monster} <strong>${card.mr}</strong> (A${assaultContrib})</div>
        <div>Tower: ${m.tower} <strong>${card.tr}</strong></div>
        <div class="trophy-stash">Stash value: ${card.mr}</div>`;
    btn.appendChild(stats);
    btn.onclick = () => {
      if (hooks.onTrophy?.(card.id)) dlg.close();
    };
    choices.appendChild(btn);
  }
  openTrophyDialog(dlg);
}

function openModalDialog(dlg) {
  requestAnimationFrame(() => {
    try {
      if (dlg.open) dlg.close();
      dlg.showModal();
    } catch (err) {
      console.warn("dialog showModal failed, retrying", err);
      try {
        dlg.close();
        dlg.showModal();
      } catch (err2) {
        console.error("dialog unavailable", err2);
      }
    }
  });
}

function openTrophyDialog(dlg) {
  openModalDialog(dlg);
}

function renderScrapPicker(game, hooks) {
  const dlg = document.getElementById("scrap-dialog");
  const choices = document.getElementById("scrap-choices");
  const confirmBtn = document.getElementById("btn-scrap-confirm");
  if (!dlg || !choices || !game.pendingScrap) return;

  const { key, count, selected } = game.pendingScrap;
  const team = game.teams[0];
  const cost = VISIT_COSTS[key];
  const prompt = document.getElementById("scrap-prompt");
  if (prompt) {
    prompt.innerHTML = `Pay <strong>${escapeHtml(formatCost(cost))}</strong> to permanently remove 
      <strong>${count}</strong> card${count === 1 ? "" : "s"} from your <strong>reserve</strong> 
      (${team.reserve.length} in reserve). Click to select, then confirm.`;
  }

  const updateConfirm = () => {
    if (confirmBtn) {
      confirmBtn.disabled = selected.size !== count;
      confirmBtn.textContent =
        selected.size === count
          ? `Confirm scrap (${count})`
          : `Select ${count - selected.size} more`;
    }
  };

  choices.innerHTML = "";
  for (const card of team.reserve) {
    const m = COLOR_META[card.color];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `scrap-choice color-${card.color}${selected.has(card.id) ? " selected" : ""}`;
    btn.appendChild(renderCard(card, { siege: true, small: true, asButton: false }));
    const stats = document.createElement("div");
    stats.className = "scrap-choice-stats";
    stats.innerHTML = `
        <div>${m.monster} <strong>${card.mr}</strong> / ${m.tower} <strong>${card.tr}</strong></div>
        <div><code>${escapeHtml(card.id)}</code></div>`;
    btn.appendChild(stats);
    btn.onclick = () => {
      if (selected.has(card.id)) selected.delete(card.id);
      else if (selected.size < count) selected.add(card.id);
      for (const el of choices.querySelectorAll(".scrap-choice")) {
        const id = el.dataset.cardId;
        el.classList.toggle("selected", selected.has(id));
      }
      updateConfirm();
    };
    btn.dataset.cardId = card.id;
    choices.appendChild(btn);
  }

  if (confirmBtn) {
    confirmBtn.onclick = () => {
      if (selected.size !== count) return;
      if (hooks.onScrapConfirm?.(key, [...selected])) {
        game.pendingScrap = null;
        dlg.close();
      }
    };
  }

  const cancelBtn = document.getElementById("btn-scrap-cancel");
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      game.pendingScrap = null;
      dlg.close();
      hooks.onScrapCancel?.();
    };
  }

  updateConfirm();
  if (!dlg.open) openModalDialog(dlg);
}

export function renderBoard(game, hooks) {
  const board = $("#board");
  if (!board || !game) return;
  board.className = `game-board board phase-${game.phase}`;

  const inMatch = !document.getElementById("screen-game")?.classList.contains("hidden");
  document.body.classList.toggle("in-match", inMatch);
  document.body.classList.toggle("your-turn", inMatch && humanMustPlay(game));

  const trophyDlg = document.getElementById("trophy-dialog");
  if (game.phase !== "trophy_pick" && trophyDlg?.open) trophyDlg.close();
  const scrapDlg = document.getElementById("scrap-dialog");
  if (!game.pendingScrap && scrapDlg?.open) scrapDlg.close();

  $("#round-label").textContent = `Round ${game.round}`;
  $("#siege-label").textContent =
    game.phase === "calamity_reveal"
      ? `Calamity · Trick ${game.tricksPlayed + 1}/${game.maxTricks}`
      : game.phase === "playing"
        ? `Siege: Team ${game.siegerTeam === 0 ? "You" : "Enemies"} · Trick ${game.tricksPlayed + 1}/${game.maxTricks}`
        : game.phase === "armory"
          ? "Armory"
          : "Game Over";

  const castles = $("#castles");
  castles.innerHTML = "";
  for (const t of game.teams) {
    const label = t.id === 0 ? "Your castle" : "Enemy castle";
    const pct = Math.max(0, (t.castleHp / t.castleMax) * 100);
    const onCd = game.cooldownMechanic ? t.cooldownIds?.size ?? 0 : 0;
    const playingCd = game.cooldownMechanic
      ? Array.isArray(t.playedThisRound)
        ? t.playedThisRound.length
        : t.playedThisRound?.size ?? 0
      : 0;
    const cdLine =
      game.cooldownMechanic && (onCd > 0 || playingCd > 0)
        ? `<div class="cooldown-badge" title="Played cards skip the next deal, then return">
            ${onCd > 0 ? `${onCd} resting` : ""}${onCd > 0 && playingCd > 0 ? " · " : ""}${playingCd > 0 ? `${playingCd} played this round` : ""}
          </div>`
        : "";
    castles.innerHTML += `
      <div class="castle team-${t.id}">
        <div class="castle-label">${label}</div>
        <div class="castle-hp">${t.castleHp} / ${t.castleMax}</div>
        <div class="castle-bar"><div class="castle-fill" style="width:${pct}%"></div></div>
        <div class="castle-stash">${stashBar(t)}</div>
        ${cdLine}
        ${t.permanent ? `<div class="perm-badge">${PERMANENT_NAMES[t.permanent]} (${t.permanentColor})</div>` : ""}
        ${[...t.activeBuffs].map((b) => `<span class="buff">${b}</span>`).join("")}
      </div>`;
  }

  const playersEl = $("#players");
  playersEl.innerHTML = "";
  const order = [2, 3, 1, 0];
  for (const id of order) {
    playersEl.appendChild(renderPlayerSlot(game.players[id], game));
  }

  renderTrickCenter(game, hooks);

  const logEl = $("#log");
  logEl.innerHTML = game.log
    .slice(-12)
    .map((l) => `<div class="log-line">${escapeHtml(l)}</div>`)
    .join("");
  logEl.scrollTop = logEl.scrollHeight;

  if (game.phase === "trophy_pick") {
    renderTrophyPicker(game, hooks);
    $("#prompt").textContent = "Choose a trophy from the eligible enemy monsters.";
    $("#armory-panel").classList.add("hidden");
    $("#btn-end-armory").classList.add("hidden");
    return;
  }

  const prompt = $("#prompt");
  prompt?.classList.toggle(
    "prompt-your-turn",
    humanMustPlay(game) && game.phase !== "armory" && game.phase !== "gameover",
  );
  if (game.phase === "calamity_reveal") {
    const step = game.calamityReveal?.step;
    if (step === "deck") {
      prompt.textContent =
        "Calamity — review the deck assault, then choose your defense.";
    } else if (step === "defend" && humanMustPlay(game)) {
      prompt.textContent = `Tower-up — play a card. Follow ${COLOR_LABELS[game.ledColor] || game.ledColor} if you can.`;
    } else if (step === "defend") {
      prompt.textContent = "Calamity — waiting for other defenders…";
    } else {
      prompt.textContent = "Calamity — review damage, then Continue.";
    }
    $("#armory-panel").classList.add("hidden");
    $("#btn-end-armory").classList.add("hidden");
  } else if (game.phase === "gameover") {
    const won = game.winner === 0;
    prompt.textContent = won ? "Victory! Enemy castle fell." : "Defeat… your castle fell.";
    $("#armory-panel").classList.add("hidden");
    $("#btn-end-armory").classList.add("hidden");
    $("#btn-play-again")?.classList.remove("hidden");
  } else if (game.phase === "armory") {
    if (game.pendingScrap) {
      prompt.textContent = `Choose ${game.pendingScrap.count} reserve card(s) to scrap.`;
      renderScrapPicker(game, hooks);
    } else {
      prompt.textContent = `Armory — ${game.humanBuysLeft} purchase(s) left. Enemies already shopped.`;
    }
    renderArmory(game, hooks);
  } else if (humanMustPlay(game)) {
    const p = game.players.find((x) => x.human);
    const siege = p.teamId === game.siegerTeam;
    prompt.textContent = game.ledColor
      ? `Your play — see cards in the center. Follow ${COLOR_LABELS[game.ledColor] || game.ledColor} if you can.`
      : "Your lead — pick a card below to set color.";
    $("#armory-panel").classList.add("hidden");
  } else {
    prompt.textContent = "Watch the trick…";
    $("#armory-panel").classList.add("hidden");
  }

  $("#btn-end-armory").classList.toggle("hidden", game.phase !== "armory");
  $("#btn-play-again")?.classList.toggle("hidden", game.phase !== "gameover");
}

function renderArmory(game, hooks) {
  const panel = $("#armory-panel");
  panel.classList.remove("hidden");
  const shop = $("#armory-shop");
  shop.innerHTML = "";
  const team = game.teams[0];
  const buysLeft = game.humanBuysLeft;

  const summary = $("#armory-summary");
  if (summary) {
    summary.textContent = `${buysLeft} purchase${buysLeft === 1 ? "" : "s"} left this visit. Each buy uses one slot (a Permanent counts as one full buy). Max one Scrap per visit.`;
  }

  const permColorSection = $("#perm-color-section");
  const showPermColor = !team.permanent && game.round >= PERMANENT_UNLOCK_ROUND;
  permColorSection?.classList.toggle("hidden", !showPermColor);

  const addSection = (title, subtitle) => {
    const sec = document.createElement("section");
    sec.className = "armory-section";
    sec.innerHTML = `<h4 class="armory-section-title">${escapeHtml(title)}</h4>`;
    if (subtitle) {
      const p = document.createElement("p");
      p.className = "armory-hint";
      p.innerHTML = subtitle;
      sec.appendChild(p);
    }
    const grid = document.createElement("div");
    grid.className = "armory-grid";
    sec.appendChild(grid);
    shop.appendChild(sec);
    return { section: sec, grid };
  };

  const addItem = (grid, key, title, cost, enabled, desc) => {
    const dur = SHOP_DURATION[key.replace(/^perm_/, "")] || "round";
    const badge = SHOP_DURATION_LABEL[dur] || dur;
    const wrap = document.createElement("div");
    wrap.className = `shop-item-wrap duration-${dur}`;
    const b = document.createElement("button");
    b.type = "button";
    b.className = `shop-item ${enabled ? "" : "disabled"}`;
    b.disabled = !enabled;
    b.onclick = () => hooks.onBuy(key);
    b.innerHTML = `
      <span class="shop-item-badge">${escapeHtml(badge)}</span>
      <span class="shop-item-title">${escapeHtml(title)}</span>
      <span class="shop-item-cost">${escapeHtml(formatCost(cost))}</span>`;
    wrap.appendChild(b);
    if (desc) {
      const d = document.createElement("p");
      d.className = "shop-item-desc";
      d.textContent = desc;
      wrap.appendChild(d);
    }
    grid.appendChild(wrap);
  };

  const { grid: visitGrid } = addSection(
    "Visit — instant (green Stash)",
    "Happens immediately when you buy. Does not carry to the next round.",
  );
  for (const [k, cost] of Object.entries(VISIT_COSTS)) {
    let ok = canAfford(team, cost) && buysLeft > 0;
    if (k.startsWith("scrap") && game.humanScrapBuys >= 1) ok = false;
    addItem(visitGrid, k, VISIT_LABELS[k] || k, cost, ok, VISIT_DESCRIPTIONS[k]);
  }

  const { section: roundSection, grid: roundGrid } = addSection(
    "Round buffs — next round only (blue Stash)",
    "Active during the upcoming round only (e.g. War Drums on your first siege trick). Cleared after that round.",
  );
  const lockedRound = [];
  for (const [k, cost] of Object.entries(ROUND_COSTS)) {
    const minR = ROUND_MIN[k] || 1;
    if (minR > game.round) {
      lockedRound.push(`${ROUND_LABELS[k] || k} (round ${minR}+)`);
      continue;
    }
    addItem(
      roundGrid,
      k,
      ROUND_LABELS[k] || k,
      cost,
      canAfford(team, cost) && buysLeft > 0,
      ROUND_DESCRIPTIONS[k],
    );
  }
  if (lockedRound.length) {
    const locked = document.createElement("p");
    locked.className = "armory-locked";
    locked.textContent = `Locked this visit: ${lockedRound.join(" · ")}.`;
    roundSection.appendChild(locked);
  }

  const { section: permSection, grid: permGrid } = addSection(
    "Permanents — rest of game (all four colors)",
    "One Permanent per team for the whole match. Unlocks at round 4 Armory. Uses one full purchase.",
  );
  if (team.permanent) {
    const owned = document.createElement("p");
    owned.className = "armory-owned";
    owned.innerHTML = `You already own: <strong>${escapeHtml(PERMANENT_NAMES[team.permanent])}</strong> (${escapeHtml(team.permanentColor)}).`;
    permSection.appendChild(owned);
  } else if (game.round < PERMANENT_UNLOCK_ROUND) {
    const locked = document.createElement("p");
    locked.className = "armory-locked";
    locked.innerHTML = `Available starting <strong>round ${PERMANENT_UNLOCK_ROUND} Armory</strong> (after round ${PERMANENT_UNLOCK_ROUND - 1} tricks). You are finishing round ${game.round}.`;
    permSection.appendChild(locked);
  } else {
    for (const [k, cost] of Object.entries(PERMANENT_COSTS)) {
      addItem(
        permGrid,
        `perm_${k}`,
        PERMANENT_NAMES[k],
        cost,
        canAfford(team, cost) && buysLeft > 0,
        PERMANENT_DESCRIPTIONS[k],
      );
    }
  }

  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function formatCost(cost) {
  return Object.entries(cost)
    .filter(([, v]) => v)
    .map(([c, v]) => `${v}${c[0].toUpperCase()}`)
    .join("+");
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

let handClickBound = false;

export function bindHandClicks(onPlay) {
  if (handClickBound) return;
  handClickBound = true;
  document.getElementById("players")?.addEventListener("click", (e) => {
    const card = e.target.closest(".card.playable");
    if (!card) return;
    onPlay(card.dataset.cardId);
  });
}

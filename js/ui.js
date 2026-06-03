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
  ARMORY_SLOTS,
  VISIT_COSTS,
  VISIT_DESCRIPTIONS,
  VISIT_LABELS,
  fourSlotChoiceCatalog,
  fourSlotChoicePresentation,
  fourSlotChoicePurchasable,
  canAfford,
  isSlotOccupiedForPlayer,
  armoryStationWorker,
  ARMORY_GLOBAL_EXCLUSIVE,
  CALAMITY_PREP_MIN_RESERVE,
  repairCost,
  stashTotals,
  resourceTotal,
  TEAM_RESOURCE_CAP,
  yellowAttackTierCost,
  blueDefenseTierCost,
  canFollow,
} from "./rules.js";
import { armoryDraftPlayerId, humanArmoryDraftTurn } from "./armoryDraft.js";
import { humanMustPlay, isCalamityLead } from "./game.js";
import { formatCalamityBlockSummary, formatReserveDepth } from "./calamity.js";

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

function resourceBar(team) {
  const t = stashTotals(team);
  const sum = resourceTotal(team);
  const pips = ["green", "blue", "red", "yellow"]
    .map(
      (c) =>
        `<span class="stash-pip color-${c}" title="${c} resources">${c[0].toUpperCase()}:${t[c]}</span>`,
    )
    .join("");
  return `${pips}<span class="stash-total" title="Total resources (cap ${TEAM_RESOURCE_CAP})">Σ${sum}/${TEAM_RESOURCE_CAP}</span>`;
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

function appendCalamityDeckSection(el, r, game) {
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

  if (r.reserveDepth) {
    const depthRow = document.createElement("p");
    depthRow.className = "calamity-reserve-depths small";
    const yours = r.reserveDepth[0] ?? game.teams[0].reserve.length;
    const theirs = r.reserveDepth[1] ?? game.teams[1].reserve.length;
    depthRow.innerHTML = `Reserve after flip: <strong>You ${yours}</strong> · <strong>Enemies ${theirs}</strong> (prep needs ≥${CALAMITY_PREP_MIN_RESERVE})`;
    deckSec.appendChild(depthRow);
  }

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

  appendCalamityDeckSection(el, r, game);

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
          ? `<span class="calamity-penalty">Underprepared reserve: +${tr.prepExtra} damage to block</span>`
          : "";
      const { breakdown, vs } = formatCalamityBlockSummary(tr);
      col.innerHTML = `
        <div class="calamity-team-head">${escapeHtml(tr.label)}</div>
        ${depthNote}
        ${prepNote}
        <div class="calamity-result">
          Block <strong>${tr.block}</strong>${escapeHtml(breakdown)} → <strong>${tr.damage}</strong> damage
          <span class="calamity-vs">vs ${escapeHtml(vs)}</span>
        </div>`;
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
        tag.textContent = off ? "→ resources" : `+${d.contrib} block`;
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

  if (game.pendingTrophy.mode !== "pick") {
    dlg.close();
    return;
  }

  const { defender, eligible, block, assault } = game.pendingTrophy;
  const humanDef = game.players.some((p) => p.human && p.teamId === defender);
  if (!humanDef) {
    dlg.close();
    return;
  }

  const prompt = document.getElementById("trophy-prompt");
  if (prompt) {
    prompt.innerHTML = `Several enemy monsters qualify, but your Block (<strong>${block}</strong>) is below resolved Assault (<strong>${assault}</strong>). 
      Pick <strong>one</strong> trophy (each below: led-color Assault contributor with <strong>monster rank ≤ Block</strong>). 
      Resource gain = <strong>⌊monster rank / 2⌋</strong> in that card's color.`;
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
        <div class="trophy-stash">Resources: ⌊${card.mr}/2⌋ = ${Math.floor(card.mr / 2)}</div>`;
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

export function renderBoard(game, hooks) {
  const board = $("#board");
  if (!board || !game) return;
  board.className = `game-board board phase-${game.phase}`;

  const inMatch = !document.getElementById("screen-game")?.classList.contains("hidden");
  document.body.classList.toggle("in-match", inMatch);
  document.body.classList.toggle("your-turn", inMatch && humanMustPlay(game));

  const trophyDlg = document.getElementById("trophy-dialog");
  if (game.phase !== "trophy_pick" && trophyDlg?.open) trophyDlg.close();

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
        <div class="castle-stash">${resourceBar(t)}</div>
        ${cdLine}
        ${t.permanent ? `<div class="perm-badge">${PERMANENT_NAMES[t.permanent]} (${t.permanentColor})</div>` : ""}
        ${[...t.activeBuffs].map((b) => `<span class="buff">${b}</span>`).join("")}
        ${t.siegeCharges > 0 ? `<span class="buff kit">Siege ${t.siegeCharges}⚡</span>` : ""}
        ${t.defenseCharges > 0 ? `<span class="buff kit">Wall ${t.defenseCharges}⚡</span>` : ""}
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

  if (game.phase === "trophy_pick" && game.pendingTrophy?.mode === "pick") {
    renderTrophyPicker(game, hooks);
    $("#prompt").textContent =
      "Block < Assault — pick one qualifying trophy from the dialog.";
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
    $("#kit-charge-bar")?.classList.toggle("hidden", step !== "defend" || !humanMustPlay(game));
    if (step === "defend" && humanMustPlay(game)) {
      const p = game.players.find((x) => x.human);
      renderKitChargeBar(game, p, false, true);
    }
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
    if (game.subphase === "armory_draft") {
      renderArmoryDraft(game, hooks);
    } else {
      prompt.textContent = `Armory — ${game.humanBuysLeft} purchase(s) left.`;
      renderArmory(game, hooks);
    }
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

  $("#btn-end-armory").classList.toggle(
    "hidden",
    game.phase !== "armory" || game.subphase === "armory_draft",
  );
  $("#btn-play-again")?.classList.toggle("hidden", game.phase !== "gameover");
}

function renderKitChargeBar(game, player, siege, calamityDef) {
  const bar = $("#kit-charge-bar");
  if (!bar) return;
  const team = game.teams[player.teamId];
  const showSiege = siege && (team.siegeCharges ?? 0) > 0;
  const showDef = (calamityDef || !siege) && (team.defenseCharges ?? 0) > 0;
  if (!showSiege && !showDef) {
    bar.classList.add("hidden");
    return;
  }
  if (game.spendSiegeChargeNext === undefined) game.spendSiegeChargeNext = true;
  if (game.spendDefenseChargeNext === undefined) game.spendDefenseChargeNext = true;
  bar.classList.remove("hidden");
  let html = "";
  if (showSiege) {
    html += `<label class="kit-charge-opt"><input type="checkbox" id="chk-spend-siege" ${
      game.spendSiegeChargeNext !== false ? "checked" : ""
    } /> Spend Siege Charge (${team.siegeCharges} left)</label>`;
  }
  if (showDef) {
    html += `<label class="kit-charge-opt"><input type="checkbox" id="chk-spend-defense" ${
      game.spendDefenseChargeNext !== false ? "checked" : ""
    } /> Spend Wall Charge (${team.defenseCharges} left)</label>`;
  }
  bar.innerHTML = html;
  const chkS = bar.querySelector("#chk-spend-siege");
  const chkD = bar.querySelector("#chk-spend-defense");
  if (chkS) {
    chkS.onchange = (e) => {
      game.spendSiegeChargeNext = e.target.checked;
    };
  }
  if (chkD) {
    chkD.onchange = (e) => {
      game.spendDefenseChargeNext = e.target.checked;
    };
  }
}

const SLOT_META = {
  green: { title: "Green — Repair", color: "green" },
  yellow: { title: "Yellow — Attack", color: "yellow" },
  blue: { title: "Blue — Defense", color: "blue" },
  red: { title: "Red — Depth Tradeoff", color: "red" },
};

function armoryDraftOpts(game, teamId) {
  return {
    redBenchUsed: (game.armoryDraft?.teamBenchBuys?.[teamId] ?? 0) >= 1,
  };
}

function stationOptionsPreviewHtml(game, team, slot) {
  const opts = armoryDraftOpts(game, team.id);
  const lines = fourSlotChoiceCatalog(game, team, slot).map((choice) => {
    const { label, cost } = fourSlotChoicePresentation(game, team, slot, choice);
    const status = fourSlotChoicePurchasable(game, team, slot, choice, opts);
    const costStr = formatCost(cost);
    const note = status.ok ? "" : ` — ${status.reason}`;
    const cls = status.ok ? "station-opt-ok" : "station-opt-muted";
    return `<li class="${cls}"><span>${escapeHtml(label)}</span> <strong>${escapeHtml(costStr)}</strong>${escapeHtml(note)}</li>`;
  });
  return lines.length
    ? `<ul class="station-options-preview">${lines.join("")}</ul>`
    : `<p class="station-options-preview empty">No options at this station.</p>`;
}

function renderArmoryDraft(game, hooks) {
  const panel = $("#armory-panel");
  const board = $("#armory-draft-board");
  const choicesEl = $("#armory-slot-choices");
  const shop = $("#armory-shop");
  if (!panel || !board) return;
  panel.classList.remove("hidden");
  shop.innerHTML = "";
  shop.classList.add("hidden");
  board.classList.remove("hidden");

  const pid = armoryDraftPlayerId(game);
  const player = pid != null ? game.players[pid] : null;
  const human = humanArmoryDraftTurn(game);
  const team = human ? game.teams[human.teamId] : game.teams[0];

  const summary = $("#armory-summary");
  if (summary) {
    const order = game.armoryDraft.pickOrder
      .map((id, i) => {
        const p = game.players[id];
        const mark = i === game.armoryDraft.pickIndex ? " ◀" : i < game.armoryDraft.pickIndex ? " ✓" : "";
        return `${p.name}${mark}`;
      })
      .join(" → ");
    summary.innerHTML = `Worker draft: <strong>${order}</strong> (same order as trick 1 next round).`;
  }

  const prompt = $("#prompt");
  if (prompt) {
    if (human) {
      prompt.textContent = `Your worker pick (${human.name}). Place on a station or Pass. Red/Blue/Yellow = one worker globally; Green = one per team. Cannot revisit your last station.`;
    } else if (player) {
      prompt.textContent = `Waiting — ${player.name} is picking…`;
    } else {
      prompt.textContent = "Armory draft finishing…";
    }
  }

  board.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "armory-stations-grid";

  for (const slot of ARMORY_SLOTS) {
    const meta = SLOT_META[slot];
    const cell = document.createElement("div");
    cell.className = `armory-station station-${slot}`;
    let occText = "Open";
    if (ARMORY_GLOBAL_EXCLUSIVE.has(slot)) {
      const occupant = armoryStationWorker(game, slot);
      if (occupant) {
        occText = `${occupant.name} (global — blocks all players)`;
      } else {
        occText = "Open (one worker globally)";
      }
    } else {
      const t0 = armoryStationWorker(game, slot, 0);
      const t1 = armoryStationWorker(game, slot, 1);
      const parts = [];
      if (t0) parts.push(`${t0.name} (your team)`);
      if (t1) parts.push(`${t1.name} (enemies)`);
      occText = parts.length ? parts.join(" · ") : "Open (one worker per team)";
    }
    const blocked =
      human &&
      (human.lastWorkerSlot === slot || isSlotOccupiedForPlayer(game, slot, human));
    cell.innerHTML = `
      <h4 class="station-title">${escapeHtml(meta.title)}</h4>
      <p class="station-occupant">${escapeHtml(occText)}</p>
      ${stationOptionsPreviewHtml(game, team, slot)}`;
    if (human && !blocked) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `station-pick color-${slot}`;
      btn.textContent = "Place worker";
      btn.onclick = () => showSlotChoices(game, hooks, slot, human);
      cell.appendChild(btn);
    } else if (human && blocked) {
      const note = document.createElement("div");
      note.className = "station-locked-note";
      note.textContent =
        human.lastWorkerSlot === slot
          ? "Cannot repeat your last station"
          : ARMORY_GLOBAL_EXCLUSIVE.has(slot)
            ? "Taken (one worker globally)"
            : "Taken (one worker per team)";
      cell.appendChild(note);
    }
    grid.appendChild(cell);
  }
  board.appendChild(grid);

  if (choicesEl) {
    choicesEl.classList.add("hidden");
    choicesEl.innerHTML = "";
  }

  if (human) {
    const passRow = document.createElement("div");
    passRow.className = "armory-draft-pass-row";
    const passBtn = document.createElement("button");
    passBtn.type = "button";
    passBtn.className = "btn-secondary";
    passBtn.textContent = "Pass (no purchase)";
    passBtn.onclick = () => hooks.onArmoryPass?.();
    passRow.appendChild(passBtn);
    board.appendChild(passRow);
  }

  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function showSlotChoices(game, hooks, slot, player) {
  const choicesEl = $("#armory-slot-choices");
  if (!choicesEl) return;
  const team = game.teams[player.teamId];
  const opts = armoryDraftOpts(game, player.teamId);
  const catalog = fourSlotChoiceCatalog(game, team, slot);
  choicesEl.classList.remove("hidden");
  choicesEl.innerHTML = `<h4>${escapeHtml(SLOT_META[slot].title)} — choose</h4>
    <p class="armory-hint">All tiers shown — save resources for a bigger buy next Armory, or take what you can afford now.</p>`;
  const grid = document.createElement("div");
  grid.className = "armory-choice-grid";

  for (const choice of catalog) {
    const { label, cost, desc } = fourSlotChoicePresentation(game, team, slot, choice);
    const status = fourSlotChoicePurchasable(game, team, slot, choice, opts);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `armory-choice-btn${status.ok ? "" : " disabled"}`;
    btn.disabled = !status.ok;
    const reasonHtml = status.ok
      ? ""
      : `<small class="armory-choice-lock">${escapeHtml(status.reason)}</small>`;
    btn.innerHTML = `<span>${escapeHtml(label)}</span><span class="shop-item-cost">${escapeHtml(formatCost(cost))}</span>${desc ? `<small class="armory-choice-desc">${escapeHtml(desc)}</small>` : ""}${reasonHtml}`;
    if (status.ok) {
      btn.onclick = () => {
        const r = hooks.onArmoryWorker?.(slot, choice);
        if (r?.ok) {
          choicesEl.classList.add("hidden");
        } else if (r?.msg) alert(r.msg);
      };
    }
    grid.appendChild(btn);
  }

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn-secondary";
  cancel.textContent = "Back";
  cancel.onclick = () => choicesEl.classList.add("hidden");
  choicesEl.appendChild(grid);
  choicesEl.appendChild(cancel);
}

function renderArmory(game, hooks) {
  const panel = $("#armory-panel");
  panel.classList.remove("hidden");
  $("#armory-draft-board")?.classList.add("hidden");
  $("#armory-slot-choices")?.classList.add("hidden");
  const shop = $("#armory-shop");
  shop.classList.remove("hidden");
  shop.innerHTML = "";
  const team = game.teams[0];
  const buysLeft = game.humanBuysLeft;

  const summary = $("#armory-summary");
  if (summary) {
    summary.textContent = `${buysLeft} purchase${buysLeft === 1 ? "" : "s"} left this visit. Each buy uses one slot (a Permanent counts as one full buy). Max one Red depth tradeoff per visit.`;
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
    "Visit — instant (green resources)",
    "Happens immediately when you buy. Does not carry to the next round.",
  );
  for (const [k, cost] of Object.entries(VISIT_COSTS)) {
    let ok = canAfford(team, cost) && buysLeft > 0;
    if (k.startsWith("red_cull") && game.humanBenchBuys >= 1) ok = false;
    addItem(visitGrid, k, VISIT_LABELS[k] || k, cost, ok, VISIT_DESCRIPTIONS[k]);
  }

  const { section: roundSection, grid: roundGrid } = addSection(
    "Round buffs — next round only (blue/yellow resources)",
    "Active next round: spend Siege/Wall Charges on tricks you care about (checkbox on your turn). Unused charges are lost.",
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

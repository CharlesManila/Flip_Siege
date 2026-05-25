/** Game state & flow. */
import { buildDeck, cardLabel, cloneCard, COLOR_META } from "./data/cards.js";
import {
  pickCard,
  pickCalamityCard,
  pickTrophyDefender,
  PLAYER_STYLES,
} from "./ai.js";
import {
  calamityDefendOrder,
  resolveCalamityFromPlays,
  returnCalamityDeckCards,
  startCalamityTrick,
} from "./calamity.js";
import {
  CASTLE_DESTROY_MIN_ROUND,
  CASTLE_HP_MAY,
  CASTLE_HP_MUST,
  FINISHER_BASE,
  PERMANENT_COSTS,
  ROUND_BUFF_BASE,
  ROUND_COSTS,
  ROUND_MIN,
  VISIT_COSTS,
  assaultValue,
  blockValue,
  isSigilElite,
  cardsDealt,
  isCalamityRound,
  isCalamityTrick,
  livingPool,
  markPlayedThisRound,
  maxTricks,
  applyPaidColorSkip,
  benchCost,
  payStash,
  recyclePaid,
  rotateRoundCooldown,
  returnBenchedToReserve,
  roundEnds,
  scaleCombat,
  scaledBuff,
  siegerTeamForTrick,
  trickPlayOrder,
  stashValue,
  stashTotals,
} from "./rules.js";
import {
  benchCardById,
  resumeArmoryDraftAfterBench,
  startArmoryDraft,
} from "./armoryDraft.js";
import {
  initPlayLog,
  recordHumanArmoryBuy,
  recordHumanCardPlay,
  recordHumanTrophy,
  recordTrickCompleted,
  submitFinishedGameIfEligible,
} from "./playLog.js";

export function createRng(seed = Date.now()) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function makeTeam(id, deck, hp) {
  return {
    id,
    deck: deck.map(cloneCard),
    reserve: [],
    benched: [],
    removedIds: new Set(),
    stash: [],
    castleHp: hp,
    castleMax: hp,
    permanent: null,
    permanentColor: null,
    purgedColors: new Set(),
    pendingBuffs: new Set(),
    activeBuffs: new Set(),
    skipBlueDeal: false,
    skipColorsDeal: new Set(),
    marchTax: false,
    borrowedOut: new Set(),
    warDrumsUsed: false,
    boilingOilUsed: false,
    siegeBreakerUsed: false,
    ironCurtainUsed: false,
    sallyGate: false,
    marchTax: false,
    cooldownIds: new Set(),
    playedThisRound: [],
  };
}

function recordCardPlayed(game, card, teamId) {
  if (!game.cooldownMechanic) return;
  markPlayedThisRound(game.teams[teamId], card.id);
}

export function newGame({
  followMode = "must",
  seed = Date.now(),
  cooldownMechanic = true,
  playLogOptIn = true,
} = {}) {
  const hp = followMode === "may" ? CASTLE_HP_MAY : CASTLE_HP_MUST;
  const deck = buildDeck();
  const rng = createRng(seed);
  const game = {
    followMode,
    castleHp: hp,
    round: 1,
    firstSieger: Math.floor(rng() * 2),
    siegerTeam: 0,
    tricksPlayed: 0,
    maxTricks: maxTricks(1),
    trickLeader: 0,
    siegeLeadSlot: 0,
    phase: "playing",
    subphase: "trick",
    blindReserveTeam: 0,
    sallyUsed: false,
    rng,
    recycle: [],
    log: [],
    trickPlays: [],
    trickOrder: [],
    trickStep: 0,
    ledColor: null,
    pendingBlindCard: null,
    armoryTeam: 0,
    humanBuysLeft: 2,
    pendingTrophy: null,
    afterTrickResult: null,
    calamityDone: false,
    calamityReveal: null,
    humanBenchBuys: 0,
    winner: null,
    teams: [makeTeam(0, deck, hp), makeTeam(1, deck, hp)],
    players: [
      {
        id: 0,
        teamId: 0,
        hand: [],
        name: "You",
        human: true,
        aiStyle: PLAYER_STYLES.human,
        workerSlot: null,
        lastWorkerSlot: null,
      },
      {
        id: 1,
        teamId: 0,
        hand: [],
        name: "Ally",
        human: false,
        aiStyle: PLAYER_STYLES.ally,
        workerSlot: null,
        lastWorkerSlot: null,
      },
      {
        id: 2,
        teamId: 1,
        hand: [],
        name: "Enemy A",
        human: false,
        aiStyle: PLAYER_STYLES.enemy0,
        workerSlot: null,
        lastWorkerSlot: null,
      },
      {
        id: 3,
        teamId: 1,
        hand: [],
        name: "Enemy B",
        human: false,
        aiStyle: PLAYER_STYLES.enemy1,
        workerSlot: null,
        lastWorkerSlot: null,
      },
    ],
    armoryStyles: ["balanced", "combat"],
    cooldownMechanic,
  };
  initPlayLog(game, playLogOptIn);
  if (cooldownMechanic) {
    game.log.push(
      "Cooldown: played cards rest next deal (max 10 per team), then return to the pool.",
    );
  }
  dealRound(game);
  setupTrick(game);
  beginTrick(game);
  return game;
}

function teamPlayers(game, tid) {
  return game.players.filter((p) => p.teamId === tid);
}

function shuffle(pool, rng) {
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dealRound(game) {
  const hs = cardsDealt(game.round);
  game.maxTricks = maxTricks(game.round);
  game.tricksPlayed = 0;
  game.siegeLeadSlot = 0;
  game.calamityDone = false;
  game.calamityReveal = null;
  game.sallyUsed = false;
  for (const t of game.teams) {
    t.warDrumsUsed = false;
    t.boilingOilUsed = false;
    t.siegeBreakerUsed = false;
    t.ironCurtainUsed = false;
    t.activeBuffs = new Set(t.pendingBuffs);
    t.pendingBuffs = new Set();
    t.sallyGate = t.activeBuffs.has("sally_gate");
    let pool = livingPool(t, game.cooldownMechanic);
    if (t.skipColorsDeal?.size) {
      pool = pool.filter((c) => !t.skipColorsDeal.has(c.color));
      t.skipColorsDeal.clear();
    } else if (t.skipBlueDeal) {
      pool = pool.filter((c) => c.color !== "blue");
      t.skipBlueDeal = false;
    }
    pool = shuffle(pool, game.rng);
    const resting = game.cooldownMechanic ? t.cooldownIds?.size ?? 0 : 0;
    const plys = teamPlayers(game, t.id);
    const need = hs * plys.length;
    const dealt = pool.slice(0, need);
    t.reserve = pool.slice(need);
    let idx = 0;
    for (const p of plys) {
      p.hand = dealt.slice(idx, idx + hs);
      idx += hs;
    }
    t.marchTax = t.activeBuffs.has("march_tax");
    if (resting > 0) {
      game.log.push(
        `${t.id === 0 ? "Your team" : "Enemies"}: ${resting} card${resting === 1 ? "" : "s"} on cooldown (not in this deal).`,
      );
    }
    const benchedN = t.benched?.length ?? 0;
    if (benchedN > 0) {
      game.log.push(
        `${t.id === 0 ? "Your team" : "Enemies"}: ${benchedN} benched card${benchedN === 1 ? "" : "s"} skip this deal.`,
      );
    }
  }
  for (const t of game.teams) {
    returnBenchedToReserve(t);
  }
  const calamity = isCalamityRound(game.round) ? " · Calamity last trick" : "";
  game.log.push(`Round ${game.round} — dealt ${hs} cards each (max ${game.maxTricks} tricks)${calamity}.`);
}

function setupTrick(game) {
  game.siegerTeam = siegerTeamForTrick(game.firstSieger, game.tricksPlayed);
  const st = teamPlayers(game, game.siegerTeam);
  game.trickLeader = st[game.siegeLeadSlot % 2].id;
  game.subphase = "trick";
}

function beginArmory(game) {
  rotateRoundCooldown(game);
  startArmoryDraft(game, finishArmoryPhase);
}

export function finishArmoryPhase(game) {
  game.round += 1;
  game.firstSieger = 1 - game.firstSieger;
  if (game.teams[0].castleHp <= 0 || game.teams[1].castleHp <= 0) {
    endGame(game);
    return;
  }
  if (game.round > 20) {
    endGame(game, "timeout");
    return;
  }
  game.phase = "playing";
  dealRound(game);
  setupTrick(game);
  beginTrick(game);
}

function endGame(game, reason = "castle") {
  game.phase = "gameover";
  if (game.teams[0].castleHp <= 0 && game.teams[1].castleHp <= 0) {
    game.winner = game.teams[0].castleHp >= game.teams[1].castleHp ? 0 : 1;
  } else if (game.teams[1].castleHp <= 0) game.winner = 0;
  else if (game.teams[0].castleHp <= 0) game.winner = 1;
  else game.winner = game.teams[0].castleHp >= game.teams[1].castleHp ? 0 : 1;
  game.log.push(reason === "timeout" ? "Match ended — highest castle wins." : "Castle destroyed!");
  submitFinishedGameIfEligible(game, reason);
}

function addStash(team, card, value, source, game, teamId) {
  team.stash.push({ card, value, source });
  if (source === "trophy") game.teams[1 - teamId].borrowedOut.add(card.id);
}

function resolveTrick(game, plays) {
  const led = plays[0].card.color;
  const rn = game.round;
  const sieger = game.siegerTeam;
  const defender = 1 - sieger;
  const st = game.teams[sieger];
  const dt = game.teams[defender];
  const isFirstSiegeTrick = !st.warDrumsUsed;
  const isFirstDefenseTrick = !dt.boilingOilUsed;
  let assault = 0;
  let block = 0;
  const siegeContrib = [];
  let sigilEliteSiege = false;
  let sigilEliteDefense = false;

  for (const { player, card, siege } of plays) {
    const team = game.teams[player.teamId];
    if (siege) {
      const raw = assaultValue(card, led, team, rn, { isFirstSiegeTrick });
      const v = scaleCombat(raw, rn);
      assault += v;
      if (v > 0) {
        siegeContrib.push({ card, teamId: player.teamId, v });
        if (player.teamId === sieger && isSigilElite(card, team)) {
          sigilEliteSiege = true;
        }
      }
    } else {
      const raw = blockValue(card, led, team, rn, { isFirstDefenseTrick });
      const v = scaleCombat(raw, rn);
      block += v;
      if (v > 0 && player.teamId === defender && isSigilElite(card, team)) {
        sigilEliteDefense = true;
      }
    }
  }

  if (sigilEliteSiege) {
    if (st.activeBuffs.has("war_drums")) st.warDrumsUsed = true;
    if (st.activeBuffs.has("siege_breaker")) st.siegeBreakerUsed = true;
  } else {
    if (!st.warDrumsUsed && st.activeBuffs.has("war_drums")) {
      assault += scaledBuff(ROUND_BUFF_BASE, rn);
      st.warDrumsUsed = true;
    }
    if (!st.siegeBreakerUsed && st.activeBuffs.has("siege_breaker")) {
      assault += scaledBuff(FINISHER_BASE, rn);
      st.siegeBreakerUsed = true;
    }
  }
  if (sigilEliteDefense) {
    if (dt.activeBuffs.has("boiling_oil")) dt.boilingOilUsed = true;
    if (dt.activeBuffs.has("iron_curtain")) dt.ironCurtainUsed = true;
  } else {
    if (!dt.boilingOilUsed && dt.activeBuffs.has("boiling_oil")) {
      block += scaledBuff(ROUND_BUFF_BASE, rn);
      dt.boilingOilUsed = true;
    }
    if (!dt.ironCurtainUsed && dt.activeBuffs.has("iron_curtain")) {
      block += scaledBuff(FINISHER_BASE, rn);
      dt.ironCurtainUsed = true;
    }
  }

  let damage = Math.max(0, assault - block);
  if (CASTLE_DESTROY_MIN_ROUND > 1 && rn < CASTLE_DESTROY_MIN_ROUND) {
    damage = Math.min(damage, Math.max(0, dt.castleHp - 1));
  }
  dt.castleHp -= damage;

  for (const { player, card, siege } of plays) {
    if (card.color === led) continue;
    let val = stashValue(card, siege);
    if (game.teams[player.teamId].marchTax) val += 1;
    addStash(game.teams[player.teamId], card, val, "off_color", game, player.teamId);
  }

  const eligibleTrophies = siegeContrib
    .filter(
      ({ teamId, card, v }) =>
        teamId === sieger && v > 0 && block >= card.mr,
    )
    .map(({ card, v }) => ({ card, assaultContrib: v }));

  const names = plays.map((p) => p.player.name).join(" → ");
  game.log.push(
    `Trick: ${names} | A${assault} B${block} → ${damage} dmg (${dt.castleHp} HP left)`,
  );
  return {
    damage,
    assault,
    block,
    leader: plays[0].player.id,
    defender,
    eligibleTrophies,
  };
}

/** none | auto | pick — auto when one eligible or Block ≥ resolved Assault. */
export function resolveTrophyAwards(eligible, assault, block) {
  if (!eligible.length) return { mode: "none", auto: [], pick: [] };
  if (eligible.length === 1) return { mode: "auto", auto: eligible, pick: [] };
  if (block >= assault) return { mode: "auto", auto: eligible, pick: [] };
  return { mode: "pick", auto: [], pick: eligible };
}

function applyTrophy(game, card, defender) {
  const dt = game.teams[defender];
  addStash(dt, card, card.mr, "trophy", game, defender);
  game.teams[1 - defender].borrowedOut.add(card.id);
  game.log.push(
    `Trophy: ${card.color} ${card.mr}/${card.tr} (monster/tower) → your Stash (value ${card.mr}).`,
  );
}

function applyTrophiesAuto(game, defender, entries) {
  for (const { card } of entries) {
    applyTrophy(game, card, defender);
    if (game.players.some((p) => p.human && p.teamId === defender)) {
      recordHumanTrophy(game, card);
    }
  }
  if (entries.length > 1) {
    game.log.push(`Trophies: took all ${entries.length} qualifying monsters (Block ≥ Assault).`);
  }
}

export function chooseTrophy(game, cardId) {
  if (!game.pendingTrophy) return false;
  const entry = game.pendingTrophy.eligible.find((e) => e.card.id === cardId);
  if (!entry) return false;
  applyTrophy(game, entry.card, game.pendingTrophy.defender);
  recordHumanTrophy(game, entry.card);
  const result = game.afterTrickResult;
  game.pendingTrophy = null;
  game.afterTrickResult = null;
  game.phase = "playing";
  completeAfterTrick(game, result);
  return true;
}

export function processPendingTrophy(game) {
  if (game.phase !== "trophy_pick" || !game.pendingTrophy) return;
  const { defender } = game.pendingTrophy;
  const humanOnDef = game.players.some((p) => p.human && p.teamId === defender);
  if (humanOnDef) return;
  const card = pickTrophyDefender(game.pendingTrophy.eligible, game.rng);
  if (card) chooseTrophy(game, card.id);
}

function playOrder(game, leaderId, sieger) {
  return trickPlayOrder(game, leaderId, sieger);
}

export function isCalamityLead(game) {
  return isCalamityTrick(game.tricksPlayed, game.round, game.players);
}

/** @deprecated */
export function isBlindLead(game) {
  return isCalamityLead(game);
}

export function humanTurn(game) {
  if (game.phase === "calamity_reveal" && game.calamityReveal?.step === "defend") {
    const pid = game.trickOrder[game.trickStep];
    if (pid == null) return null;
    const p = game.players[pid];
    return p.human ? p : null;
  }
  if (game.phase !== "playing") return null;
  const pid = game.trickOrder[game.trickStep];
  if (pid == null) return null;
  const p = game.players[pid];
  return p.human ? p : null;
}

export function humanMustPlay(game) {
  return humanTurn(game) != null;
}

/** @deprecated */
export function humanMustLead(game) {
  return humanMustPlay(game) && game.trickStep === 0 && !isBlindLead(game);
}

function beginTrick(game) {
  game.trickPlays = [];
  game.trickStep = 0;
  game.trickOrder = [];

  if (isCalamityLead(game) && !game.calamityDone) {
    game.calamityDone = true;
    const reveal = startCalamityTrick(game);
    if (reveal) {
      game.calamityReveal = reveal;
      game.ledColor = reveal.led;
      game.phase = "calamity_reveal";
      game.trickPlays = [];
      game.trickStep = 0;
      game.trickOrder = [];
      return false;
    }
  }

  const leaderId = game.trickLeader;
  const sieger = game.siegerTeam;
  game.trickOrder = playOrder(game, leaderId, sieger);
  game.ledColor = null;
  return advanceTrickStep(game, true);
}

/** Play AI cards; if singleStep, only one AI card per call (for UI). */
function advanceTrickStep(game, singleStep = false) {
  while (game.trickStep < game.trickOrder.length) {
    const pid = game.trickOrder[game.trickStep];
    const p = game.players[pid];
    if (!p.hand.length) {
      game.trickStep++;
      continue;
    }
    const siege = p.teamId === game.siegerTeam;
    const isLead = game.trickPlays.length === 0 && game.trickStep === 0;
    if (p.human) return false;
    const led = game.ledColor || (game.trickPlays[0]?.card.color ?? "green");
    const card = pickCard(game, p, led, siege, isLead);
    p.hand = p.hand.filter((c) => c.id !== card.id);
    game.trickPlays.push({ player: p, card, siege });
    recordCardPlayed(game, card, p.teamId);
    if (!game.ledColor) game.ledColor = card.color;
    game.trickStep++;
    if (singleStep) return false;
  }
  finishTrickPlays(game);
  return true;
}

export function playHumanCard(game, cardId) {
  const p = humanTurn(game);
  if (!p) return false;
  const card = p.hand.find((c) => c.id === cardId);
  if (!card) return false;
  const led = game.ledColor;
  if (led && game.followMode === "must") {
    const opts = p.hand.filter((c) => c.color === led);
    if (opts.length && card.color !== led) return false;
  }
  p.hand = p.hand.filter((c) => c.id !== card.id);
  const siege =
    game.phase === "calamity_reveal" ? false : p.teamId === game.siegerTeam;
  game.trickPlays.push({ player: p, card, siege });
  recordCardPlayed(game, card, p.teamId);
  recordHumanCardPlay(game, card, {
    phase: game.phase === "calamity_reveal" ? "calamity" : "trick",
    isLead: game.trickPlays.length === 1,
  });
  if (game.phase === "calamity_reveal" && game.playLog) {
    game.playLog.calamityPlays.push({
      at: new Date().toISOString(),
      round: game.round,
      card: { id: card.id, color: card.color, mr: card.mr, tr: card.tr },
    });
  }
  if (!game.ledColor) game.ledColor = card.color;
  game.trickStep++;
  if (game.phase === "calamity_reveal") {
    advanceCalamityDefense(game, true);
    return true;
  }
  advanceTrickStep(game, true);
  return true;
}

function finishTrickPlays(game) {
  const result = resolveTrick(game, game.trickPlays);
  const { mode, auto, pick } = resolveTrophyAwards(
    result.eligibleTrophies || [],
    result.assault,
    result.block,
  );
  if (mode === "auto") {
    applyTrophiesAuto(game, result.defender, auto);
    completeAfterTrick(game, result);
    return;
  }
  if (mode === "pick") {
    game.afterTrickResult = result;
    game.pendingTrophy = {
      defender: result.defender,
      eligible: pick,
      block: result.block,
      assault: result.assault,
      mode: "pick",
    };
    game.phase = "trophy_pick";
    return;
  }
  completeAfterTrick(game, result);
}

function completeAfterTrick(game, result) {
  afterTrick(game, result);
}

/** Step 1: deck shown → start defense picks. Step 2: results → next round. */
export function advanceCalamityStep(game) {
  if (game.phase !== "calamity_reveal" || !game.calamityReveal) return;
  const r = game.calamityReveal;

  if (r.step === "deck") {
    r.step = "defend";
    game.trickPlays = [];
    game.trickStep = 0;
    game.trickOrder = calamityDefendOrder(game);
    return;
  }

  if (r.step === "results") {
    finishCalamityRound(game);
  }
}

function finishCalamityPlays(game) {
  const r = game.calamityReveal;
  const teamResults = resolveCalamityFromPlays(game, game.trickPlays);
  returnCalamityDeckCards(game, r.c1Team, r.c2Team, r.c1, r.c2);
  for (const { player, card } of game.trickPlays) {
    if (card.color !== game.calamityReveal.led) {
      const team = game.teams[player.teamId];
      let val = stashValue(card, false);
      if (team.marchTax) val += 1;
      addStash(team, card, val, "off_color", game, player.teamId);
    }
  }
  game.calamityReveal.teamResults = teamResults;
  game.calamityReveal.step = "results";
  game.trickPlays = [];
  game.trickOrder = [];
}

function finishCalamityRound(game) {
  game.calamityReveal = null;
  game.ledColor = null;
  game.trickPlays = [];
  game.trickOrder = [];
  game.tricksPlayed += 1;
  recordTrickCompleted(game);
  game.phase = "playing";

  if (game.teams[0].castleHp <= 0 || game.teams[1].castleHp <= 0) {
    endGame(game);
    return;
  }
  if (roundEnds(game.tricksPlayed, game.maxTricks, game.players)) {
    beginArmory(game);
    return;
  }
  game.siegeLeadSlot += 1;
  setupTrick(game);
  beginTrick(game);
}

/** Play defense cards during calamity (tower-up). */
function advanceCalamityDefense(game, singleStep = false) {
  const led = game.calamityReveal.led;
  while (game.trickStep < game.trickOrder.length) {
    const pid = game.trickOrder[game.trickStep];
    const p = game.players[pid];
    if (!p.hand.length) {
      game.trickStep++;
      continue;
    }
    if (p.human) return false;
    const card = pickCalamityCard(game, p, led);
    p.hand = p.hand.filter((c) => c.id !== card.id);
    game.trickPlays.push({ player: p, card, siege: false });
    recordCardPlayed(game, card, p.teamId);
    game.trickStep++;
    if (singleStep) return false;
  }
  finishCalamityPlays(game);
  return true;
}

export function advanceAI(game) {
  if (game.phase === "trophy_pick") {
    processPendingTrophy(game);
    return;
  }
  if (game.phase === "calamity_reveal") {
    if (game.calamityReveal?.step === "defend") {
      advanceCalamityDefense(game, true);
    }
    return;
  }
  if (game.phase !== "playing") return;
  if (!game.trickOrder.length && !game.trickPlays.length) {
    beginTrick(game);
    return;
  }
  if (humanTurn(game)) return;
  advanceTrickStep(game, true);
  // Trick may have just ended inside advanceTrickStep; resolve AI trophy now.
  if (game.phase === "trophy_pick") processPendingTrophy(game);
}

export function needsHumanTrophyPick(game) {
  if (game.phase !== "trophy_pick" || !game.pendingTrophy) return false;
  if (game.pendingTrophy.mode !== "pick") return false;
  const { defender } = game.pendingTrophy;
  return game.players.some((p) => p.human && p.teamId === defender);
}

function afterTrick(game, result) {
  if (!result) return;
  game.tricksPlayed += 1;
  recordTrickCompleted(game);
  game.trickPlays = [];

  if (game.teams[0].castleHp <= 0 || game.teams[1].castleHp <= 0) {
    endGame(game);
    return;
  }
  if (roundEnds(game.tricksPlayed, game.maxTricks, game.players)) {
    beginArmory(game);
    return;
  }

  game.siegeLeadSlot += 1;
  setupTrick(game);
  beginTrick(game);
}

export function buyArmoryItem(game, key, permanentColor = null) {
  const team = game.teams[0];
  if (game.humanBuysLeft <= 0) return { ok: false, msg: "No purchases left." };

  if (key.startsWith("perm_")) {
    const perm = key.slice(5);
    if (team.permanent) return { ok: false, msg: "Already have a Permanent." };
    if (game.round < 4) return { ok: false, msg: "Permanents unlock round 4." };
    const cost = PERMANENT_COSTS[perm];
    if (!cost) return { ok: false, msg: "Unknown item." };
    const paid = payStash(team, cost, game, 0);
    if (!paid) return { ok: false, msg: "Cannot afford." };
    game.recycle.push(...recyclePaid(paid));
    team.permanent = perm;
    team.permanentColor = permanentColor || "green";
    if (perm === "purge") {
      team.purgedColors.add(team.permanentColor);
      for (const c of team.deck) {
        if (c.color === team.permanentColor) team.removedIds.add(c.id);
      }
    }
    game.humanBuysLeft -= 1;
    game.log.push(`You bought ${perm}.`);
    recordHumanArmoryBuy(game, key, { permanent: perm, color: team.permanentColor });
    return { ok: true };
  }

  if (VISIT_COSTS[key]) {
    if (key.startsWith("bench") && game.humanBenchBuys >= 1) {
      return { ok: false, msg: "Max one Bench per visit." };
    }
    const cost = VISIT_COSTS[key];
    if (!canAffordTeam(team, cost)) return { ok: false, msg: "Cannot afford." };
    if (key === "bench_1" && team.reserve.length < 1) return { ok: false, msg: "Reserve empty." };
    if (key === "bench_2" && team.reserve.length < 2) return { ok: false, msg: "Reserve too small." };
    const paid = payStash(team, cost, game, 0);
    if (!paid) return { ok: false, msg: "Payment failed." };
    game.recycle.push(...recyclePaid(paid));
    if (key === "repair") {
      team.castleHp = Math.min(team.castleMax, team.castleHp + 2);
      game.humanBuysLeft -= 1;
      game.log.push(`You repaired castle (+2 HP → ${team.castleHp}).`);
      recordHumanArmoryBuy(game, key);
      return { ok: true };
    }
    if (key.startsWith("bench")) {
      return { ok: false, msg: "Choose reserve cards to bench.", needsBenchPick: true, benchKey: key };
    }
  }

  if (ROUND_COSTS[key]) {
    if ((ROUND_MIN[key] || 1) > game.round) return { ok: false, msg: "Not unlocked yet." };
    const cost = ROUND_COSTS[key];
    if (!canAffordTeam(team, cost)) return { ok: false, msg: "Cannot afford." };
    const paid = payStash(team, cost, game, 0);
    if (!paid) return { ok: false, msg: "Payment failed." };
    game.recycle.push(...recyclePaid(paid));
    team.pendingBuffs.add(key);
    team.skipBlueDeal = true;
    game.humanBuysLeft -= 1;
    game.log.push(`You bought ${key} for next round.`);
    recordHumanArmoryBuy(game, key);
    return { ok: true };
  }

  return { ok: false, msg: "Unknown purchase." };
}

function canAffordTeam(team, cost) {
  const t = stashTotals(team);
  return ["green", "blue", "red", "yellow"].every((c) => t[c] >= (cost[c] || 0));
}

/** Validate Bench purchase (no payment yet). */
export function validateBenchPurchase(game, key, teamId = 0) {
  const team = game.teams[teamId];
  if (game.phase !== "armory") return { ok: false, msg: "Not at Armory." };
  const benchBuys = game.armoryDraft?.teamBenchBuys?.[teamId] ?? game.humanBenchBuys ?? 0;
  if (key.startsWith("bench") && benchBuys >= 1) {
    return { ok: false, msg: "Max one Bench per visit." };
  }
  const cost = VISIT_COSTS[key];
  if (!cost) return { ok: false, msg: "Unknown Bench." };
  if (!canAffordTeam(team, cost)) return { ok: false, msg: "Cannot afford." };
  const need = key === "bench_2" ? 2 : 1;
  if (team.reserve.length < need) {
    return { ok: false, msg: need === 2 ? "Reserve too small." : "Reserve empty." };
  }
  return { ok: true, count: need, cost };
}

/** Pay for Bench — cards skip next deal, then return to reserve top. */
export function completeBenchPurchase(game, key, cardIds, teamId = 0) {
  const v = validateBenchPurchase(game, key, teamId);
  if (!v.ok) return v;
  const team = game.teams[teamId];
  const need = v.count;
  const ids = [...new Set(cardIds)];
  if (ids.length !== need) {
    return { ok: false, msg: `Select exactly ${need} card${need === 1 ? "" : "s"}.` };
  }
  for (const id of ids) {
    if (!team.reserve.some((c) => c.id === id)) {
      return { ok: false, msg: "Card not in reserve." };
    }
  }

  const pb = game.pendingBench;
  const cost = pb?.draftChoice?.bench ? benchCost(pb.draftChoice.bench) : v.cost;
  const paid = payStash(team, cost, game, teamId);
  if (!paid) return { ok: false, msg: "Payment failed." };
  game.recycle.push(...recyclePaid(paid));
  applyPaidColorSkip(team, cost);
  for (const id of ids) benchCardById(team, id);

  if (game.armoryDraft?.teamBenchBuys) {
    game.armoryDraft.teamBenchBuys[teamId] += 1;
    const labels = ids
      .map((id) => {
        const c = team.deck.find((x) => x.id === id) || team.benched.find((x) => x.id === id);
        return c ? cardLabel(c, true) : id;
      })
      .join(", ");
    game.log.push(`You benched ${labels} (${key}).`);
    recordHumanArmoryBuy(game, key, { benched_ids: ids });
    resumeArmoryDraftAfterBench(game);
    return { ok: true };
  }

  game.humanBenchBuys = (game.humanBenchBuys || 0) + 1;
  game.humanBuysLeft -= 1;
  const labels = ids
    .map((id) => {
      const c = team.deck.find((x) => x.id === id) || team.benched.find((x) => x.id === id);
      return c ? cardLabel(c, true) : id;
    })
    .join(", ");
  game.log.push(`You benched ${labels} — skip next deal, then back to reserve top (${key}).`);
  recordHumanArmoryBuy(game, key, { benched_ids: ids });
  return { ok: true };
}

export function skipArmory(game) {
  game.humanBuysLeft = 0;
}

export function confirmArmoryDone(game) {
  finishArmoryPhase(game);
}
